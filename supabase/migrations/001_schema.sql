-- ================================================================
-- FIGURINHACOPA26 — SCHEMA COMPLETO
-- Projeto: bnmarcfzarqdbjacpslj
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ================================================================
-- TABELA: selecoes (48 seleções disponíveis nos PDFs)
-- ================================================================
CREATE TABLE IF NOT EXISTS selecoes (
  id            SERIAL PRIMARY KEY,
  codigo        VARCHAR(3) UNIQUE NOT NULL,
  nome          VARCHAR(100) NOT NULL,
  nome_arquivo  VARCHAR(200) NOT NULL,
  continente    VARCHAR(50),
  bandeira      VARCHAR(10),
  ativa         BOOLEAN DEFAULT TRUE,
  preco         NUMERIC(8,2) DEFAULT 34.00,
  storage_path  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- TABELA: pacotes (produtos vendidos)
-- ================================================================
CREATE TABLE IF NOT EXISTS pacotes (
  id             SERIAL PRIMARY KEY,
  slug           VARCHAR(60) UNIQUE NOT NULL,
  nome           VARCHAR(120) NOT NULL,
  descricao      TEXT,
  tipo           VARCHAR(30) NOT NULL,
  preco          NUMERIC(8,2) NOT NULL,
  preco_original NUMERIC(8,2),
  destaque       BOOLEAN DEFAULT FALSE,
  badge          VARCHAR(60),
  ativo          BOOLEAN DEFAULT TRUE,
  ordem          SMALLINT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- TABELA: especiais
-- ================================================================
CREATE TABLE IF NOT EXISTS especiais (
  id           SERIAL PRIMARY KEY,
  nome         VARCHAR(150) NOT NULL,
  tipo         VARCHAR(40) NOT NULL,
  descricao    TEXT,
  storage_path TEXT,
  pagina       SMALLINT,
  ativa        BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- TABELA: clientes
-- ================================================================
CREATE TABLE IF NOT EXISTS clientes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome       VARCHAR(150) NOT NULL,
  email      VARCHAR(200) UNIQUE NOT NULL,
  telefone   VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- TABELA: pedidos
-- ================================================================
CREATE TABLE IF NOT EXISTS pedidos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id      UUID REFERENCES clientes(id) ON DELETE SET NULL,
  status          VARCHAR(30) DEFAULT 'pendente',
  forma_pagamento VARCHAR(30),
  valor_total     NUMERIC(8,2) NOT NULL,
  codigo_pedido   VARCHAR(20) UNIQUE NOT NULL DEFAULT UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 8)),
  email_destino   VARCHAR(200),
  cupom_id        INT,
  desconto_aplicado NUMERIC(8,2) DEFAULT 0,
  pago_em         TIMESTAMPTZ,
  entregue_em     TIMESTAMPTZ,
  observacao      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- TABELA: itens_pedido
-- ================================================================
CREATE TABLE IF NOT EXISTS itens_pedido (
  id               SERIAL PRIMARY KEY,
  pedido_id        UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  pacote_id        INT REFERENCES pacotes(id),
  selecao_id       INT REFERENCES selecoes(id),
  quantidade       SMALLINT DEFAULT 1,
  preco_unitario   NUMERIC(8,2) NOT NULL,
  storage_path     TEXT,
  entregue         BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- TABELA: entregas
-- ================================================================
CREATE TABLE IF NOT EXISTS entregas (
  id           SERIAL PRIMARY KEY,
  pedido_id    UUID REFERENCES pedidos(id) ON DELETE CASCADE,
  item_id      INT REFERENCES itens_pedido(id) ON DELETE CASCADE,
  tipo         VARCHAR(30) DEFAULT 'email',
  destino      VARCHAR(200),
  status       VARCHAR(20) DEFAULT 'pendente',
  link_download TEXT,
  tentativas   SMALLINT DEFAULT 0,
  enviado_em   TIMESTAMPTZ,
  erro_msg     TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- TABELA: cupons_desconto
-- ================================================================
CREATE TABLE IF NOT EXISTS cupons_desconto (
  id            SERIAL PRIMARY KEY,
  codigo        VARCHAR(30) UNIQUE NOT NULL,
  desconto_pct  SMALLINT,
  desconto_fixo NUMERIC(8,2),
  tipo          VARCHAR(20) DEFAULT 'percentual',
  usos_max      INT DEFAULT 100,
  usos_atuais   INT DEFAULT 0,
  valido_ate    TIMESTAMPTZ,
  ativo         BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- ÍNDICES
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_codigo ON pedidos(codigo_pedido);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_id ON itens_pedido(pedido_id);
CREATE INDEX IF NOT EXISTS idx_entregas_pedido ON entregas(pedido_id);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);

-- ================================================================
-- TRIGGER updated_at
-- ================================================================
CREATE OR REPLACE FUNCTION fn_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pedidos_updated_at
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION fn_updated_at();

-- ================================================================
-- RLS (Row Level Security)
-- ================================================================
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pedido ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas ENABLE ROW LEVEL SECURITY;

-- Leitura pública: seleções, pacotes, especiais
ALTER TABLE selecoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pacotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE especiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE cupons_desconto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "selecoes_public_read" ON selecoes FOR SELECT USING (ativa = TRUE);
CREATE POLICY "pacotes_public_read" ON pacotes FOR SELECT USING (ativo = TRUE);
CREATE POLICY "especiais_public_read" ON especiais FOR SELECT USING (ativa = TRUE);

-- Service role bypassa RLS automaticamente
