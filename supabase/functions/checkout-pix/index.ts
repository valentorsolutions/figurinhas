import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Configurações EfiBank PIX ─────────────────────────────────
// IMPORTANTE: Adicione nas secrets do Supabase:
//   EFI_CLIENT_ID, EFI_CLIENT_SECRET, EFI_PIX_KEY, EFI_P12_BASE64
// O certificado .p12 deve ser convertido para Base64 e salvo em EFI_P12_BASE64
// ────────────────────────────────────────────────────────────────

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EFI_CLIENT_ID    = Deno.env.get("EFI_CLIENT_ID")!;
const EFI_CLIENT_SECRET= Deno.env.get("EFI_CLIENT_SECRET")!;
const EFI_PIX_KEY      = Deno.env.get("EFI_PIX_KEY")!; // sua chave PIX (CPF/CNPJ/EVP)
const EFI_P12_B64      = Deno.env.get("EFI_P12_BASE64")!; // certificado .p12 em Base64
const EFI_BASE_URL     = "https://pix.api.efipay.com.br"; // produção

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

// ── Obter token OAuth2 da EfiBank ────────────────────────────
async function getEfiToken(): Promise<string> {
  const auth = btoa(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`);

  // O certificado P12 é obrigatório pela EfiBank
  // Em Edge Functions (Deno), usamos fetch com clientCertificate
  const p12Bytes = Uint8Array.from(atob(EFI_P12_B64), c => c.charCodeAt(0));

  const res = await fetch(`${EFI_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    // @ts-ignore: Deno suporta client certificate via TLS
    client: { certificate: p12Bytes, password: "" },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`EFI OAuth falhou: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

// ── Criar cobrança PIX (cob imediata) ───────────────────────
async function criarCobrancaPix(valor: number, nome: string, cpf: string, descricao: string) {
  const token = await getEfiToken();

  const body = {
    calendario: { expiracao: 3600 }, // 1 hora
    devedor: { cpf, nome },
    valor: { original: valor.toFixed(2) },
    chave: EFI_PIX_KEY,
    solicitacaoPagador: descricao.slice(0, 140),
  };

  const res = await fetch(`${EFI_BASE_URL}/v2/cob`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`EFI cob falhou: ${res.status} — ${err}`);
  }

  return await res.json();
}

// ── Gerar QR Code do PIX ────────────────────────────────────
async function gerarQrCode(txid: string) {
  const token = await getEfiToken();

  const res = await fetch(`${EFI_BASE_URL}/v2/loc/${txid}/qrcode`, {
    headers: { "Authorization": `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`EFI QRCode falhou: ${res.status}`);
  return await res.json();
}

// ── Handler principal ────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405 });
  }

  try {
    const {
      nome,
      email,
      cpf,
      pacote_slug,
      selecao_id,
      cupom,
    } = await req.json();

    if (!nome || !email || !cpf || !pacote_slug) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: nome, email, cpf, pacote_slug" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Buscar pacote
    const { data: pacote, error: peErr } = await supabase
      .from("pacotes")
      .select("*")
      .eq("slug", pacote_slug)
      .eq("ativo", true)
      .single();

    if (peErr || !pacote) {
      return new Response(JSON.stringify({ error: "Pacote não encontrado" }), { status: 404 });
    }

    let valorFinal = pacote.preco;
    let descontoAplicado = 0;

    // 2. Validar cupom (se enviado)
    if (cupom) {
      const { data: cp } = await supabase
        .from("cupons_desconto")
        .select("*")
        .eq("codigo", cupom.toUpperCase())
        .eq("ativo", true)
        .gt("valido_ate", new Date().toISOString())
        .single();

      if (cp && cp.usos_atuais < cp.usos_max) {
        const desc = cp.tipo === "percentual"
          ? pacote.preco * (cp.desconto_pct / 100)
          : (cp.desconto_fixo ?? 0);
        descontoAplicado = Math.min(desc, pacote.preco);
        valorFinal = Math.max(0, pacote.preco - descontoAplicado);

        // Incrementar uso do cupom
        await supabase
          .from("cupons_desconto")
          .update({ usos_atuais: cp.usos_atuais + 1 })
          .eq("id", cp.id);
      }
    }

    // 3. Criar ou recuperar cliente
    let clienteId: string;
    const { data: clienteExist } = await supabase
      .from("clientes")
      .select("id")
      .eq("email", email)
      .single();

    if (clienteExist) {
      clienteId = clienteExist.id;
    } else {
      const { data: novoCliente, error: ceErr } = await supabase
        .from("clientes")
        .insert({ nome, email, cpf })
        .select("id")
        .single();
      if (ceErr) throw new Error(`Erro ao criar cliente: ${ceErr.message}`);
      clienteId = novoCliente.id;
    }

    // 4. Criar pedido (pendente)
    const { data: pedido, error: pdErr } = await supabase
      .from("pedidos")
      .insert({
        cliente_id: clienteId,
        status: "pendente",
        forma_pagamento: "pix",
        valor_total: valorFinal,
        email_destino: email,
        desconto_aplicado: descontoAplicado,
      })
      .select("id, codigo_pedido")
      .single();

    if (pdErr) throw new Error(`Erro ao criar pedido: ${pdErr.message}`);

    // 5. Criar item do pedido
    await supabase.from("itens_pedido").insert({
      pedido_id: pedido.id,
      pacote_id: pacote.id,
      selecao_id: selecao_id ?? null,
      preco_unitario: valorFinal,
    });

    // 6. Criar cobrança PIX na EfiBank
    const descricaoPix = `FigurinhaCopa26 - ${pacote.nome} - Pedido #${pedido.codigo_pedido}`;
    const cobResponse = await criarCobrancaPix(valorFinal, nome, cpf, descricaoPix);

    const { qrcode, imagemQrcode } = await gerarQrCode(cobResponse.loc.id);

    // 7. Salvar txid e qrcode no pedido
    await supabase
      .from("pedidos")
      .update({
        txid_efi: cobResponse.txid,
        qrcode_pix: qrcode,
      })
      .eq("id", pedido.id);

    return new Response(
      JSON.stringify({
        success: true,
        pedido_id: pedido.id,
        codigo_pedido: pedido.codigo_pedido,
        valor_total: valorFinal,
        desconto_aplicado: descontoAplicado,
        pix: {
          qrcode,
          qrcode_imagem: imagemQrcode,
          txid: cobResponse.txid,
          expiracao_minutos: 60,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Erro checkout:", message);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );
  }
});
