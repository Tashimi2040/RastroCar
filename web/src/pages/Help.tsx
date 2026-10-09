import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, MessageSquareText, MapPin, Bell, Lock, Smartphone, HelpCircle, Route, Shapes } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { TRACKER_IMAGE, VEHICLE_IMAGES } from '../lib/images';

type Section = 'inicio' | 'instalacao' | 'sms' | 'plataforma' | 'celular' | 'dicas' | 'faq';

const SECTIONS: { id: Section; label: string; icon: JSX.Element }[] = [
  { id: 'inicio', label: 'Comece aqui', icon: <HelpCircle size={15} /> },
  { id: 'instalacao', label: 'Instalar o rastreador', icon: <Wrench size={15} /> },
  { id: 'sms', label: 'Configurar por SMS', icon: <MessageSquareText size={15} /> },
  { id: 'plataforma', label: 'Usar a plataforma', icon: <MapPin size={15} /> },
  { id: 'celular', label: 'Instalar no celular', icon: <Smartphone size={15} /> },
  { id: 'dicas', label: 'Dicas e problemas', icon: <Bell size={15} /> },
  { id: 'faq', label: 'Perguntas frequentes', icon: <HelpCircle size={15} /> },
];

export function Help() {
  const { isStaff } = useAuth();
  const [section, setSection] = useState<Section>('inicio');
  return (
    <div className="stack">
      <div className="help-hero">
        <div>
          <h2>Central de ajuda RastroCar</h2>
          <p>Tudo o que você precisa para instalar o rastreador, configurar o chip, acompanhar o veículo e resolver os problemas mais comuns. Guias em linguagem simples, passo a passo.</p>
        </div>
        <img src={TRACKER_IMAGE} alt="Rastreador GPS" />
      </div>
      <div className="help-nav">
        {SECTIONS.map((s) => (
          <button key={s.id} className={`btn sm ${section === s.id ? 'primary' : ''}`} onClick={() => setSection(s.id)}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {section === 'inicio' && (
        <div className="card">
          <div className="card-header"><h2>Como funciona o rastreamento</h2></div>
          <div className="card-body stack">
            <p>O rastreador instalado no veículo recebe a posição dos satélites GPS e envia, pela rede de celular (chip), para o servidor RastroCar. O servidor grava cada ponto, monta as rotas e avisa você sobre eventos importantes. O painel (site ou app no celular) mostra tudo em tempo real.</p>
            <div className="steps">
              <div className="step"><div><h4>1. Instale o rastreador no veículo</h4><p>Alimentação 12V, fio da ignição e (opcional) relé de bloqueio. Veja o guia de instalação.</p></div></div>
              <div className="step"><div><h4>2. Configure o chip e o servidor por SMS</h4><p>Três ou quatro mensagens de texto apontam o aparelho para o servidor RastroCar.</p></div></div>
              <div className="step"><div><h4>3. Vincule o rastreador ao veículo</h4><p>{isStaff ? 'Ele aparece automaticamente em Rastreadores. Vincule ao veículo do cliente e crie o acesso.' : 'O administrador vincula o aparelho ao seu veículo e cria seu login.'}</p></div></div>
              <div className="step"><div><h4>4. Acompanhe pelo painel</h4><p>Mapa ao vivo, histórico de rotas, alertas, cercas virtuais e bloqueio remoto.</p></div></div>
            </div>
            <div className="grid cols-4">
              {Object.entries({ car: 'Carros', motorcycle: 'Motos', pickup: 'Picapes', truck: 'Caminhões e vans' }).map(([k, v]) => (
                <div key={k} className="card" style={{ textAlign: 'center', padding: 12 }}>
                  <img src={VEHICLE_IMAGES[k]} alt={v} style={{ width: '100%', borderRadius: 10 }} />
                  <div className="strong" style={{ marginTop: 8 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {section === 'instalacao' && (
        <div className="card">
          <div className="card-header"><h2>Instalação física do rastreador (GT06 / ST-901 / TK103)</h2></div>
          <div className="card-body stack">
            <div className="alert warning">Desconecte o polo negativo da bateria antes de mexer na fiação. Se não tiver prática com elétrica automotiva, contrate um instalador — a garantia do veículo pode ser afetada por instalações erradas.</div>
            <h3>Fios do chicote (padrão da maioria dos modelos)</h3>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Fio</th><th>Função</th><th>Onde ligar</th></tr></thead>
                <tbody>
                  <tr><td><span className="wire"><i style={{ background: '#dc2626' }} /> Vermelho</span></td><td>Positivo 12V/24V permanente</td><td>Positivo direto da bateria ou fio 30 do comutador de ignição (sempre com energia), com fusível de 2A.</td></tr>
                  <tr><td><span className="wire"><i style={{ background: '#111' }} /> Preto</span></td><td>Negativo (terra)</td><td>Chassi ou negativo da bateria. Contato firme e sem tinta.</td></tr>
                  <tr><td><span className="wire"><i style={{ background: '#f59e0b' }} /> Amarelo / Laranja</span></td><td>Sinal de ignição (ACC)</td><td>Fio que recebe 12V só com a chave ligada (pós-chave / fio 15). É ele que permite detectar "ignição ligada" e montar as viagens corretamente.</td></tr>
                  <tr><td><span className="wire"><i style={{ background: '#fff', border: '1px solid #999' }} /> Branco / Verde</span></td><td>Saída para relé de bloqueio</td><td>Vai ao pino 85 do relé (o 86 vai ao +12V). Os pinos 30 e 87a interrompem o circuito da bomba de combustível ou da ignição.</td></tr>
                  <tr><td><span className="wire"><i style={{ background: '#2563eb' }} /> Azul (se houver)</span></td><td>Botão SOS</td><td>Botão de pânico escondido; o outro terminal vai ao negativo.</td></tr>
                </tbody>
              </table>
            </div>
            <div className="steps">
              <div className="step"><div><h4>Escolha o local</h4><p>Embaixo do painel, atrás do rádio ou no console central. Longe de metal por cima (o GPS precisa "ver" o céu) e longe de calor excessivo. Em motos: sob o banco ou dentro da carenagem, com o aparelho envolvido em fita isolante contra umidade.</p></div></div>
              <div className="step"><div><h4>Insira o chip</h4><p>Desligue o PIN do chip em um celular antes. Coloque com o rastreador desenergizado. Use chip de operadora com boa cobertura na região (Vivo e Claro costumam ter melhor sinal fora das capitais).</p></div></div>
              <div className="step"><div><h4>Ligue alimentação e ignição</h4><p>Vermelho no 12V permanente, preto no terra, amarelo no pós-chave. Isole as emendas com fita ou termorretrátil. Sem o fio de ignição, o sistema ainda funciona, mas as viagens são detectadas por movimento.</p></div></div>
              <div className="step"><div><h4>Relé de bloqueio (opcional)</h4><p>Use relé automotivo de 5 pinos (30/85/86/87/87a). Interrompa o positivo da bomba de combustível: o veículo apaga suavemente e não religa. Nunca corte a ignição em movimento em veículos com direção elétrica.</p></div></div>
              <div className="step"><div><h4>Teste antes de fechar o painel</h4><p>Leve o veículo para área aberta. Os LEDs do aparelho param de piscar rápido quando há GPS e rede. Em 2 a 5 minutos ele deve aparecer no painel RastroCar com a posição correta.</p></div></div>
            </div>
          </div>
        </div>
      )}

      {section === 'sms' && (
        <div className="card">
          <div className="card-header"><h2>Configurar o rastreador por SMS</h2></div>
          <div className="card-body stack">
            <p>Os comandos abaixo são enviados por mensagem de texto do seu celular para o número do chip que está no rastreador. Aguarde a resposta de cada um antes de mandar o próximo.</p>
            {isStaff ? (
              <div className="alert info">Gere os comandos prontos, com o endereço deste servidor e a APN da operadora, em <Link to="/rastreadores">Rastreadores → Instruções de configuração</Link>. Lá você escolhe o modelo e a operadora e copia cada SMS.</div>
            ) : (
              <div className="alert info">Se você recebeu o rastreador já configurado pela equipe, não precisa fazer nada aqui. Estes comandos são úteis para reconfigurar após a troca de chip.</div>
            )}
            <h3>GT06 / GT06N e clones (o mais comum)</h3>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Objetivo</th><th>SMS</th><th>Resposta esperada</th></tr></thead>
                <tbody>
                  <tr><td>APN da operadora (Vivo)</td><td className="mono">APN,zap.vivo.com.br,vivo,vivo#</td><td>OK</td></tr>
                  <tr><td>APN (Claro)</td><td className="mono">APN,claro.com.br,claro,claro#</td><td>OK</td></tr>
                  <tr><td>APN (TIM)</td><td className="mono">APN,timbrasil.br,tim,tim#</td><td>OK</td></tr>
                  <tr><td>Servidor por domínio</td><td className="mono">SERVER,1,SEU_DOMINIO,5023,0#</td><td>OK</td></tr>
                  <tr><td>Servidor por IP</td><td className="mono">SERVER,0,SEU_IP,5023,0#</td><td>OK</td></tr>
                  <tr><td>Intervalo de envio</td><td className="mono">TIMER,10,30#</td><td>OK</td></tr>
                  <tr><td>Detectar ignição</td><td className="mono">ACCREP,ON#</td><td>OK</td></tr>
                  <tr><td>Reiniciar</td><td className="mono">RESET#</td><td>—</td></tr>
                  <tr><td>Ver configuração</td><td className="mono">PARAM#</td><td>Lista de parâmetros</td></tr>
                  <tr><td>Bloquear / liberar por SMS</td><td className="mono">RELAY,1# / RELAY,0#</td><td>OK</td></tr>
                </tbody>
              </table>
            </div>
            <h3>J16 / J16A / J16B (4G) e chips M2M de revenda</h3>
            <p>O J16 fala GT06, mas alguns lotes saem com o GPRS desligado ou em outro protocolo. Chips M2M que vêm junto com o rastreador costumam <strong>receber</strong> os SMS sem responder: envie mesmo assim e confira a chegada no menu Rastreadores.</p>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr><td>Ligar a transmissão GPRS</td><td className="mono">GPRSON,1#</td><td>OK</td></tr>
                  <tr><td>Selecionar protocolo GT06</td><td className="mono">SZCS#PTL_SEL=2</td><td>sem # no final</td></tr>
                  <tr><td>APN broker Allcom (Algar)</td><td className="mono">APN,allcom.br,allcom,allcom#</td><td>confirme com o vendedor</td></tr>
                  <tr><td>APN broker M2Data (Algar)</td><td className="mono">APN,m2data.algar.br,algar,algar#</td><td>confirme com o vendedor</td></tr>
                  <tr><td>APN Vivo Smart M2M</td><td className="mono">APN,smart.m2m.vivo.com.br,vivo,vivo#</td><td>confirme com o vendedor</td></tr>
                  <tr><td>Servidor por IP (mais seguro no J16)</td><td className="mono">SERVER,0,SEU_IP,5023,0#</td><td>OK</td></tr>
                  <tr><td>Consultar GPRS / servidor gravado</td><td className="mono">GPRSSET# / URL#</td><td>parâmetros</td></tr>
                  <tr><td>Restaurar padrão de fábrica</td><td className="mono">FACTORY#</td><td>refazer APN e SERVER depois</td></tr>
                </tbody>
              </table>
            </div>
            <p>Teste decisivo: coloque um chip comum de celular (com dados) no rastreador e repita APN + SERVER + RESET. Se conectar, o problema é o chip M2M/APN. Se não conectar, o aparelho não está recebendo os SMS ou está sem alimentação.</p>
            <h3>Sinotrack ST-901 (senha padrão 0000)</h3>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr><td>APN</td><td className="mono">8030000 zap.vivo.com.br vivo vivo</td><td>SET APN OK</td></tr>
                  <tr><td>Servidor</td><td className="mono">8040000 SEU_DOMINIO 5023</td><td>SET IP OK</td></tr>
                  <tr><td>Intervalo (s)</td><td className="mono">8050000 10</td><td>SET TIME OK</td></tr>
                  <tr><td>Bloquear / liberar</td><td className="mono">5550000 / 6660000</td><td>OK</td></tr>
                </tbody>
              </table>
            </div>
            <h3>Coban TK103 (senha padrão 123456)</h3>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr><td>Iniciar</td><td className="mono">begin123456</td><td>begin ok</td></tr>
                  <tr><td>APN</td><td className="mono">apn123456 zap.vivo.com.br</td><td>apn ok</td></tr>
                  <tr><td>Servidor</td><td className="mono">adminip123456 SEU_DOMINIO 5023</td><td>adminip ok</td></tr>
                  <tr><td>Modo GPRS</td><td className="mono">gprs123456</td><td>GPRS ok</td></tr>
                  <tr><td>Envio contínuo</td><td className="mono">fix010s***n123456</td><td>—</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {section === 'plataforma' && (
        <div className="stack">
          {[
            { icon: <MapPin size={18} />, title: 'Mapa ao vivo', text: 'Mostra todos os veículos com cor por status: verde em movimento, âmbar parado com ignição ligada, azul parado, vermelho sem sinal. Toque no veículo para ver velocidade, ignição, bateria e abrir no Google Maps. Use a busca para achar por nome, placa ou cliente e marque "Seguir" para o mapa acompanhar o veículo.' },
            { icon: <Route size={18} />, title: 'Histórico de rotas', text: 'Escolha o veículo e o período. A plataforma separa automaticamente as viagens (início, fim, distância, duração, velocidade máxima e média, endereços) e as paradas. Clique numa viagem para ver o trajeto no mapa colorido por velocidade e use o player para reproduzir o percurso. O botão de download exporta a rota em CSV.' },
            { icon: <Bell size={18} />, title: 'Alertas', text: 'Eventos gerados pelo sistema e pelo rastreador: ignição ligada/desligada, excesso de velocidade, entrada/saída de cerca, sem comunicação, SOS, corte de alimentação, vibração, bateria baixa. Marque como lido depois de verificar. Alertas críticos aparecem em vermelho.' },
            { icon: <Shapes size={18} />, title: 'Cercas virtuais', text: 'Desenhe um círculo ou polígono no mapa (garagem, cliente, cidade) e receba alerta quando o veículo entrar ou sair. Uma cerca pode valer para todos os veículos do cliente ou para um só.' },
            { icon: <Lock size={18} />, title: 'Comandos e bloqueio', text: 'Envie "Bloquear motor" para acionar o relé instalado; "Desbloquear" libera. O comando vai pela internet do chip e a resposta do aparelho fica registrada. Se o rastreador estiver sem sinal, o comando fica na fila e é entregue quando ele conectar. Bloqueie apenas com o veículo parado.' },
          ].map((s) => (
            <div key={s.title} className="card">
              <div className="card-header"><h2 className="row">{s.icon} {s.title}</h2></div>
              <div className="card-body"><p className="muted">{s.text}</p></div>
            </div>
          ))}
        </div>
      )}

      {section === 'celular' && (
        <div className="card">
          <div className="card-header"><h2>Instalar o RastroCar como aplicativo no celular</h2></div>
          <div className="card-body stack">
            <p>O painel é um aplicativo web instalável (PWA): funciona no Android e no iPhone sem loja de apps, com ícone na tela inicial e abertura em tela cheia.</p>
            <div className="grid cols-2">
              <div className="steps">
                <div className="step"><div><h4>Android (Chrome)</h4><p>Abra o endereço do painel no Chrome → toque nos três pontos (⋮) → <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</p></div></div>
                <div className="step"><div><h4>iPhone (Safari)</h4><p>Abra o endereço no Safari → toque no botão <strong>Compartilhar</strong> (quadrado com seta) → <strong>Adicionar à Tela de Início</strong>.</p></div></div>
              </div>
              <div className="steps">
                <div className="step"><div><h4>Login salvo</h4><p>Depois de entrar uma vez, o app mantém você conectado por 7 dias. Use "Alterar senha" no menu para trocar a senha.</p></div></div>
                <div className="step"><div><h4>Navegação no celular</h4><p>A barra inferior dá acesso rápido a Painel, Mapa, Rotas e Alertas. O botão "Mais" abre o menu completo.</p></div></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {section === 'dicas' && (
        <div className="card">
          <div className="card-header"><h2>Dicas e solução de problemas</h2></div>
          <div className="card-body">
            <div className="faq">
              <details open><summary>O rastreador não aparece no painel</summary><p>1) Confira se o chip tem dados ativos e PIN desligado (teste o chip num celular). 2) Envie <span className="mono">PARAM#</span> (GT06) e verifique se o servidor e a porta estão corretos. 3) Confirme que a porta TCP do servidor está liberada no firewall/roteador. 4) Veja os LEDs: GPS piscando lento = com sinal; GSM piscando rápido = sem rede. 5) Reinicie com <span className="mono">RESET#</span>.</p></details>
              <details><summary>Posição errada ou "sem fix GPS"</summary><p>Antena GPS coberta por metal ou película metálica, ou primeiro uso em local fechado. Leve o veículo para área aberta por 5 minutos. Se persistir, reposicione o aparelho com a face da antena para cima.</p></details>
              <details><summary>Fica offline com frequência</summary><p>Cobertura da operadora fraca, chip sem crédito/pacote ou aparelho em modo de economia. Aumente o intervalo parado (<span className="mono">TIMER,10,60#</span>) para economizar dados e verifique o plano. Considere chip M2M com roaming entre operadoras.</p></details>
              <details><summary>Viagens não fecham ou aparecem picadas</summary><p>Ligue o fio de ignição (amarelo) e ative <span className="mono">ACCREP,ON#</span>. Sem ignição, a plataforma usa movimento: ajuste em Configurações o tempo parado para encerrar viagem (padrão 5 min).</p></details>
              <details><summary>Bloqueio não funciona</summary><p>Verifique a instalação do relé e teste com o veículo parado. Em modelos antigos, mude a variante do comando para DYD/HFYD em Comandos. Confirme a senha do rastreador em Configurações (padrão 123456).</p></details>
              <details><summary>Consumo de dados do chip</summary><p>Com envio a cada 10 s em movimento, um rastreador usa cerca de 20 a 50 MB por mês. Planos de 100 MB ou chips M2M são suficientes.</p></details>
              <details><summary>Horário errado nas posições</summary><p>A plataforma usa o horário dos satélites (UTC) e converte para o fuso do seu navegador. Se o aparelho enviar horário local, ajuste <span className="mono">GMT,W,3,0#</span> ou verifique o fuso em Configurações.</p></details>
              <details><summary>Quero trocar o chip</summary><p>Desligue o aparelho, troque o chip e reenvie os comandos de APN e servidor. O IMEI continua o mesmo, então o histórico é mantido.</p></details>
            </div>
          </div>
        </div>
      )}

      {section === 'faq' && (
        <div className="card">
          <div className="card-header"><h2>Perguntas frequentes</h2></div>
          <div className="card-body">
            <div className="faq">
              <details open><summary>Quais rastreadores funcionam?</summary><p>Qualquer aparelho que use os protocolos GT06/Concox (GT06, GT06N, TR02, JM-VL01, E3, WeTrack, ET300, X3), H02/Sinotrack (ST-901, ST-906, ST-915) ou TK103/Coban (TK103, TK303, GPS103). São os modelos vendidos como "rastreador com app sem mensalidade". A porta única detecta o protocolo automaticamente.</p></details>
              <details><summary>Preciso pagar mensalidade do app do fabricante?</summary><p>Não. O rastreador é apontado para o servidor RastroCar; você só paga o plano de dados do chip.</p></details>
              <details><summary>Quantos veículos posso cadastrar?</summary><p>Não há limite fixo. O servidor foi projetado para centenas de rastreadores enviando a cada 10 segundos.</p></details>
              <details><summary>O cliente vê os veículos de outros clientes?</summary><p>Não. Cada acesso de cliente só enxerga os veículos, rotas, alertas, cercas e comandos do próprio cliente.</p></details>
              <details><summary>Como mudar o estilo do mapa (ruas, satélite, Google)?</summary><p>Use o seletor no canto do mapa: "Ruas" (padrão, visual semelhante ao Google Maps, gratuito), "Satélite" (imagens Esri com nomes de ruas), "Google" e "G. Satélite" (tiles diretos do Google, uso não oficial). A escolha fica salva no seu aparelho.</p></details>
              <details><summary>Os dados ficam guardados por quanto tempo?</summary><p>Posições brutas: conforme a retenção configurada (padrão 365 dias). Viagens, paradas e alertas são mantidos sem limite.</p></details>
              <details><summary>Funciona sem internet no celular?</summary><p>O app abre, mas mapa e posições precisam de internet. As últimas telas visitadas ficam em cache para abrir mais rápido.</p></details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
