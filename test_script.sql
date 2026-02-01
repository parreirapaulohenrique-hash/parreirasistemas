-- =======================================================================================
-- SCRIPT DE TESTE DE CARGA (MOCK DATA)
-- Simula a inserção de dados na tabela de Staging e executa a procedure
-- =======================================================================================

-- 1. Limpar Staging (Opcional)
TRUNCATE TABLE stg_despachos_carga;

-- 2. Inserir Dados Brutos (Simulando leitura do CSV)
-- Dados baseados no amostra do arquivo: 30/05/2025;550;550;SAMUEL MOTOS...
INSERT INTO stg_despachos_carga 
(batch_id, raw_data, raw_nf, raw_codigo_cliente, raw_nome_cliente, raw_cidade, raw_transportadora, raw_peso, raw_valor_nota)
VALUES 
('LOTE_001', '30/05/2025', '550', '550', 'SAMUEL MOTOS EIRELI ME', 'SÃO FELIX DO XINGU', 'EXPRESSO SAO MIGUEL LTDA', '10', 'R$ 2.850,00'),
('LOTE_001', '30/05/2025', '551', '551', 'OFICINA DO JOAO', 'REDENCAO', 'TRANSPORTADORA JAMEF', '15.5', 'R$ 1.500,00'),
('LOTE_001', '30/05/2025', '552', '552', 'AUTO PECAS SILVA', 'XINGUARA', 'BRASPRESS', '5.2', 'R$ 850,00');

-- 3. Executar o Processamento
CALL sp_processar_carga_despachos('LOTE_001');

-- 4. Verificar Resultados
SELECT '--- RESULTADO STAGING ---' as check_point;
SELECT id_stg, status_processamento, log_erro FROM stg_despachos_carga WHERE batch_id = 'LOTE_001';

SELECT '--- TRANSPORTADORAS CADASTRADAS ---' as check_point;
SELECT * FROM transportadoras;

SELECT '--- DESPACHOS IMPORTADOS ---' as check_point;
SELECT * FROM despachos;

SELECT '--- KPI GERAL ---' as check_point;
SELECT * FROM vw_kpi_geral;
