# Rastreadores suportados e configuração

## Protocolos

| Protocolo | Porta | Modelos típicos | Login | Bloqueio |
|---|---|---|---|---|
| **GT06 / Concox** (binário) | 5023 (auto) | GT06, GT06N, GT06E, TR02, TK300, JM-VL01/02/03, WeTrack 2, ET300, GT02A, X3, CRX1, E3/E3+, J16 | pacote 0x01 com IMEI em BCD | `RELAY,1#` / `RELAY,0#` (ou `DYD,senha#` / `HFYD,senha#`) |
| **H02** (texto `*HQ,...#`) | 5023 (auto) | Sinotrack ST-901, ST-901M, ST-903, ST-906, ST-915, clones TK-Star | primeira mensagem V1 | `S20` |
| **TK103 / Coban** (texto `imei:...;`) | 5023 (auto) | TK103A/B, TK104, TK106, TK303, GPS103, GPS303 | `##,imei:...,A;` → `LOAD` | `J` / `K` |

O gateway identifica o protocolo pelos primeiros bytes da conexão. Se preferir portas separadas (alguns provedores exigem), defina `TCP_PORT_GT06`, `TCP_PORT_H02` e `TCP_PORT_TK103`.

## O que é extraído de cada mensagem

- Posição: data/hora do fix (UTC), latitude, longitude, velocidade (km/h), curso, satélites, validade do fix.
- Estado: ignição (ACC), nível de bateria, tensão externa (0x94), sinal GSM, relé/bloqueio, carregando.
- Alarmes: SOS, corte de alimentação, vibração, bateria baixa, tensão baixa, excesso de velocidade, cerca (do aparelho), movimento, violação, porta, ligado/desligado, antena GPS, colisão, jammer.
- Respostas de comandos (0x15 / 0x21 / V4) são associadas ao último comando enviado.

## Comandos por SMS (resumo)

Gere os comandos prontos no painel (**Rastreadores → Instruções de configuração**). Referência rápida:

### GT06 / Concox
```
APN,zap.vivo.com.br,vivo,vivo#        (Claro: claro.com.br,claro,claro | TIM: timbrasil.br,tim,tim)
SERVER,1,rastreio.seudominio.com.br,5023,0#   (por IP: SERVER,0,1.2.3.4,5023,0#)
GMT,W,3,0#
TIMER,10,30#
ACCREP,ON#
RESET#
PARAM#   /  STATUS#  /  URL#  /  GPRSSET#   (consultas)
```

### Sinotrack ST-901 (senha padrão 0000)
```
8030000 zap.vivo.com.br vivo vivo
8040000 rastreio.seudominio.com.br 5023
8050000 10
RESET0000
```

### Coban TK103 (senha padrão 123456)
```
begin123456
apn123456 zap.vivo.com.br
up123456 vivo vivo          (se a operadora exigir usuário/senha)
adminip123456 rastreio.seudominio.com.br 5023
gprs123456
fix010s***n123456
```

## APNs das operadoras brasileiras

| Operadora | APN | Usuário | Senha |
|---|---|---|---|
| Vivo | zap.vivo.com.br | vivo | vivo |
| Claro | claro.com.br | claro | claro |
| TIM | timbrasil.br | tim | tim |
| Oi | gprs.oi.com.br | oi | oi |
| Algar | algar.br | algar | algar |
| Arqia (M2M) | arqia.br | arqia | arqia |
| Vivo M2M | m2m.vivo.com.br | vivo | vivo |
| Claro M2M | m2m.claro.com.br | claro | claro |

## Instalação física

Ver a Central de ajuda no painel (menu **Ajuda e tutoriais → Instalar o rastreador**): fiação (vermelho 12V, preto terra, amarelo ignição, branco/verde relé), posicionamento, teste.

## Adicionando um novo protocolo

1. Crie `server/src/gateway/protocols/<nome>.ts` implementando `ProtocolHandler` (`detect`, `frameLength`, `decode`, `encodeCommand`).
2. Registre em `server/src/gateway/protocols/index.ts`.
3. Adicione testes em `*.test.ts` com pacotes reais capturados (`LOG_LEVEL=debug` mostra os frames em hex).
