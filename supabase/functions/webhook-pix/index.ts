import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY   = Deno.env.get("RESEND_API_KEY")!;
const EFI_CLIENT_ID    = Deno.env.get("EFI_CLIENT_ID")!;
const EFI_CLIENT_SECRET= Deno.env.get("EFI_CLIENT_SECRET")!;
const EFI_P12_B64      = Deno.env.get("EFI_P12_BASE64")!;
const EFI_BASE_URL     = "https://pix.api.efipay.com.br";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);
const resend   = new Resend(RESEND_API_KEY);

// ── Token EfiBank ────────────────────────────────────────────
async function getEfiToken(): Promise<string> {
  const auth = btoa(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`);
  const p12Bytes = Uint8Array.from(atob(EFI_P12_B64), c => c.charCodeAt(0));

  const res = await fetch(`${EFI_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
    // @ts-ignore
    client: { certificate: p12Bytes, password: "" },
  });

  if (!res.ok) throw new Error(`EFI auth falhou: ${await res.text()}`);
  return (await res.json()).access_token;
}

// ── Verificar status do PIX na EfiBank ───────────────────────
async function verificarPix(txid: string): Promise<string> {
  const token = await getEfiToken();
  const res = await fetch(`${EFI_BASE_URL}/v2/cob/${txid}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`EFI consulta falhou: ${res.status}`);
  const data = await res.json();
  return data.status; // ATIVA | CONCLUIDA | REMOVIDA_PELO_USUARIO_RECEBEDOR | REMOVIDA_PELO_PSP
}

// ── Gerar URL assinada do PDF no Supabase Storage ───────────
async function gerarLinkDownload(bucket: string, arquivo: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(arquivo, 86400 * 7); // 7 dias de validade

  if (error) throw new Error(`Erro ao gerar link: ${error.message}`);
  return data.signedUrl;
}

// ── Montar HTML do e-mail com links de download ──────────────
function buildEmailHtml(nome: string, codigoPedido: string, links: { nome: string; url: string }[]): string {
  const linksHtml = links.map(l =>
    `<tr>
      <td style="padding:10px 0;border-bottom:1px solid rgba(251,191,36,0.2)">
        <span style="color:#f0f4f0;font-size:14px">${l.nome}</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid rgba(251,191,36,0.2);text-align:right">
        <a href="${l.url}" style="background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:13px">
          📥 Baixar PDF
        </a>
      </td>
    </tr>`
  ).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a1a0d;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#0d2e12;border-radius:16px;border:1px solid rgba(251,191,36,0.3);overflow:hidden;max-width:100%">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0d2e12,#1a5c2a);padding:40px;text-align:center;border-bottom:2px solid #fbbf24">
              <div style="font-size:40px;margin-bottom:10px">⚽🏆</div>
              <h1 style="color:#fbbf24;margin:0;font-size:28px;letter-spacing:2px">FigurinhaCopa26</h1>
              <p style="color:#4ade80;margin:8px 0 0;font-size:14px">Sua coleção chegou!</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px">
              <h2 style="color:#f0f4f0;margin:0 0 10px;font-size:20px">Olá, ${nome}! 👋</h2>
              <p style="color:#a0a8a0;font-size:15px;line-height:1.6;margin:0 0 24px">
                Seu pagamento foi confirmado com sucesso! Abaixo estão os links para download das suas figurinhas digitais.
                Os links são válidos por <strong style="color:#fbbf24">7 dias</strong>.
              </p>

              <!-- Código do pedido -->
              <div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:8px;padding:16px;margin-bottom:28px;text-align:center">
                <span style="color:#9ca8a0;font-size:12px;text-transform:uppercase;letter-spacing:1px">Código do Pedido</span>
                <div style="color:#fbbf24;font-size:22px;font-weight:bold;letter-spacing:3px;margin-top:4px">#${codigoPedido}</div>
              </div>

              <!-- Links de download -->
              <h3 style="color:#fbbf24;margin:0 0 16px;font-size:16px;text-transform:uppercase;letter-spacing:1px">Seus Downloads</h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${linksHtml}
              </table>

              <!-- Aviso -->
              <div style="background:rgba(74,222,128,0.1);border-left:3px solid #4ade80;padding:16px;margin-top:28px;border-radius:0 8px 8px 0">
                <p style="color:#a0a8a0;font-size:13px;margin:0;line-height:1.5">
                  💡 <strong style="color:#4ade80">Dica:</strong> Salve os PDFs no seu dispositivo antes que os links expirem.
                  Cada PDF contém todas as figurinhas da seleção em alta resolução.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0a1a0d;padding:24px;text-align:center;border-top:1px solid rgba(251,191,36,0.2)">
              <p style="color:#4a5a4a;font-size:12px;margin:0">
                FigurinhaCopa26 — Copa do Mundo 2026 🌎<br>
                Problemas? Responda este e-mail que te ajudamos.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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

  try {
    const { txid, pedido_id } = await req.json();

    if (!txid || !pedido_id) {
      return new Response(JSON.stringify({ error: "txid e pedido_id são obrigatórios" }), { status: 400 });
    }

    // 1. Verificar status do PIX na EfiBank
    const statusPix = await verificarPix(txid);

    if (statusPix !== "CONCLUIDA") {
      return new Response(
        JSON.stringify({ paid: false, status: statusPix }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar pedido e itens
    const { data: pedido, error: peErr } = await supabase
      .from("pedidos")
      .select("*, clientes(nome, email), itens_pedido(*, pacotes(*), selecoes(*))")
      .eq("id", pedido_id)
      .single();

    if (peErr || !pedido) throw new Error("Pedido não encontrado");
    if (pedido.status === "pago") {
      return new Response(JSON.stringify({ paid: true, status: "already_processed" }), { status: 200 });
    }

    // 3. Marcar pedido como pago
    await supabase
      .from("pedidos")
      .update({ status: "pago", pago_em: new Date().toISOString() })
      .eq("id", pedido_id);

    // 4. Gerar links de download para cada item
    const links: { nome: string; url: string }[] = [];

    for (const item of pedido.itens_pedido) {
      const pacote = item.pacotes;
      const selecao = item.selecoes;

      if (pacote?.tipo === "equipe" && selecao) {
        // Download de seleção específica
        const url = await gerarLinkDownload("selecoes", selecao.nome_arquivo);
        links.push({ nome: `${selecao.bandeira_emoji} ${selecao.nome}`, url });

      } else if (pacote?.tipo === "completo") {
        // Download de todas as 48 seleções
        const { data: todasSelecoes } = await supabase
          .from("selecoes")
          .select("nome, nome_arquivo, bandeira_emoji")
          .eq("ativa", true)
          .order("codigo");

        for (const s of todasSelecoes ?? []) {
          const url = await gerarLinkDownload("selecoes", s.nome_arquivo);
          links.push({ nome: `${s.bandeira_emoji} ${s.nome}`, url });
        }

      } else if (pacote?.tipo === "especiais") {
        // Download do pack de especiais
        const url = await gerarLinkDownload("especiais", "00_Especiais.pdf");
        links.push({ nome: "🌟 Pack Especiais — Figurinhas Lendárias", url });

      } else if (pacote?.tipo === "ultimate") {
        // Tudo: todas as seleções + especiais
        const { data: todasSelecoes } = await supabase
          .from("selecoes")
          .select("nome, nome_arquivo, bandeira_emoji")
          .eq("ativa", true)
          .order("codigo");

        for (const s of todasSelecoes ?? []) {
          const url = await gerarLinkDownload("selecoes", s.nome_arquivo);
          links.push({ nome: `${s.bandeira_emoji} ${s.nome}`, url });
        }
        const urlEsp = await gerarLinkDownload("especiais", "00_Especiais.pdf");
        links.push({ nome: "🌟 Pack Especiais — Figurinhas Lendárias", url: urlEsp });
      }

      // Marcar item como entregue
      await supabase.from("itens_pedido").update({ entregue: true }).eq("id", item.id);

      // Registrar na tabela entregas
      await supabase.from("entregas").insert({
        pedido_id: pedido_id,
        item_id: item.id,
        tipo: "email",
        destino: pedido.clientes.email,
        status: "enviado",
        link_download: links[links.length - 1]?.url ?? null,
        enviado_em: new Date().toISOString(),
      });
    }

    // 5. Enviar e-mail com Resend
    const { error: emailErr } = await resend.emails.send({
      from: "FigurinhaCopa26 <noreply@figurinhacopa26.com.br>",
      to: [pedido.clientes.email],
      subject: `⚽ Seus downloads chegaram! Pedido #${pedido.codigo_pedido}`,
      html: buildEmailHtml(pedido.clientes.nome, pedido.codigo_pedido, links),
    });

    if (emailErr) {
      console.error("Erro ao enviar e-mail:", emailErr);
    }

    // 6. Marcar pedido como entregue
    await supabase
      .from("pedidos")
      .update({ status: "entregue", entregue_em: new Date().toISOString() })
      .eq("id", pedido_id);

    return new Response(
      JSON.stringify({ paid: true, links_gerados: links.length, email_enviado: !emailErr }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Erro webhook-pix:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    );
  }
});
