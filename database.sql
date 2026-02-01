-- =======================================================================================
-- SISTEMA DE GESTÃO DE DESPACHOS - INTEGRAÇÃO ERP
-- Arquitetura: ELT (Extract, Load, Transform)
-- Dialeto: MySQL / MariaDB Compactível
-- =======================================================================================

-- 1. ESTRUTURA DE CADASTRO (TABELAS FINAIS)
-- =============================================

CREATE TABLE IF NOT EXISTS transportadoras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL UNIQUE,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS despachos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    data_despacho DATE NOT NULL,
    numero_nf VARCHAR(50),
    codigo_cliente VARCHAR(50),
    nome_cliente VARCHAR(255),
    cidade_destino VARCHAR(100),
    transportadora_id INT,
    peso_kg DECIMAL(10,3),
    valor_nota DECIMAL(15,2),
    valor_frete DECIMAL(15,2),
    status_entrega VARCHAR(50) DEFAULT 'EM TRANSITO',
    
    FOREIGN KEY (transportadora_id) REFERENCES transportadoras(id),
    INDEX idx_data (data_despacho),
    INDEX idx_cliente (codigo_cliente)
);

-- 2. ÁREA DE STAGING (TABELA INTERMEDIÁRIA DE CARGA)
-- Recebe os dados "sujos" do CSV sem validação de tipos para garantir a ingestão
-- =============================================

CREATE TABLE IF NOT EXISTS stg_despachos_carga (
    id_stg INT AUTO_INCREMENT PRIMARY KEY,
    batch_id VARCHAR(50), -- Identificador do lote de carga
    
    -- Colunas do CSV (Todas como VARCHAR para evitar erros de carga)
    raw_data VARCHAR(20),
    raw_nf VARCHAR(50),
    raw_codigo_cliente VARCHAR(50),
    raw_nome_cliente VARCHAR(255),
    raw_cidade VARCHAR(100),
    raw_transportadora VARCHAR(100),
    raw_peso VARCHAR(50),
    raw_valor_nota VARCHAR(50),
    raw_valor_frete VARCHAR(50),
    
    status_processamento ENUM('PENDENTE', 'PROCESSADO', 'ERRO') DEFAULT 'PENDENTE',
    log_erro TEXT,
    data_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. PROCEDURE DE INTEGRAÇÃO (ETL/PROCESSAMENTO)
-- Processa os dados da Staging para as Tabelas Finais
-- =============================================

DELIMITER //

CREATE PROCEDURE sp_processar_carga_despachos(IN p_batch_id VARCHAR(50))
BEGIN
    DECLARE finished INT DEFAULT 0;
    DECLARE v_id_stg INT;
    DECLARE v_transp_nome VARCHAR(255);
    DECLARE v_data DATE;
    DECLARE v_peso DECIMAL(10,3);
    DECLARE v_valor DECIMAL(15,2);
    
    -- Cursor para iterar sobre registros pendentes do lote
    DECLARE cur_carga CURSOR FOR 
        SELECT id_stg, raw_transportadora 
        FROM stg_despachos_carga 
        WHERE batch_id = p_batch_id AND status_processamento = 'PENDENTE';
        
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = 1;

    START TRANSACTION;

    OPEN cur_carga;

    read_loop: LOOP
        FETCH cur_carga INTO v_id_stg, v_transp_nome;
        IF finished = 1 THEN LEAVE read_loop; END IF;

        -- Lógica de Tratamento de Erros dentro do Loop
        BEGIN
            DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
            BEGIN
                -- Em caso de erro, marca na staging
                UPDATE stg_despachos_carga 
                SET status_processamento = 'ERRO', log_erro = 'Erro genérico SQL ao processar linha'
                WHERE id_stg = v_id_stg;
            END;

            -- 1. Normalização / Upsert de Transportadora
            IF v_transp_nome IS NOT NULL AND v_transp_nome != '' THEN
                INSERT INTO transportadoras (nome) VALUES (v_transp_nome)
                ON DUPLICATE KEY UPDATE nome = nome; -- Garante que existe sem duplicar
            END IF;

            -- 2. Inserção na Tabela Fato (Despachos)
            -- Conversão de tipos "on the fly"
            -- Exemplo de conversão de moeda BR: 'R$ 1.200,50' -> 1200.50
            INSERT INTO despachos (
                data_despacho, numero_nf, codigo_cliente, nome_cliente, 
                cidade_destino, transportadora_id, peso_kg, valor_nota
            )
            SELECT 
                STR_TO_DATE(raw_data, '%d/%m/%Y'), -- Assume formato DD/MM/AAAA
                raw_nf,
                raw_codigo_cliente,
                raw_nome_cliente,
                raw_cidade,
                (SELECT id FROM transportadoras WHERE nome = raw_transportadora LIMIT 1),
                
                -- Limpeza de Strings Numéricas
                CAST(REPLACE(REPLACE(REPLACE(raw_peso, 'Kg', ''), '.', ''), ',', '.') AS DECIMAL(10,3)),
                CAST(REPLACE(REPLACE(REPLACE(REPLACE(raw_valor_nota, 'R$', ''), ' ', ''), '.', ''), ',', '.') AS DECIMAL(15,2))
                
            FROM stg_despachos_carga
            WHERE id_stg = v_id_stg;

            -- Sucesso
            UPDATE stg_despachos_carga 
            SET status_processamento = 'PROCESSADO' 
            WHERE id_stg = v_id_stg;
            
        END;
    END LOOP;

    CLOSE cur_carga;
    COMMIT;
    
    SELECT CONCAT('Carga do lote ', p_batch_id, ' processada com sucesso.') as Mensagem;
END //

DELIMITER ;

-- 4. VIEWS DE RELATÓRIO
-- =============================================

CREATE OR REPLACE VIEW vw_kpi_geral AS
SELECT 
    COUNT(*) as total_despachos,
    SUM(valor_nota) as valor_total_vendido,
    SUM(peso_kg) as peso_total,
    COUNT(DISTINCT transportadora_id) as qtd_transportadoras_ativas
FROM despachos;

CREATE OR REPLACE VIEW vw_performance_transportadora AS
SELECT 
    t.nome as transportadora,
    COUNT(d.id) as total_entregas,
    SUM(d.valor_nota) as valor_transportado,
    AVG(d.peso_kg) as peso_medio
FROM despachos d
JOIN transportadoras t ON d.transportadora_id = t.id
GROUP BY t.nome
ORDER BY total_entregas DESC;
