import type { AppSettings } from './settings.js';

export interface DeviceModel {
  id: string;
  name: string;
  protocol: 'gt06' | 'h02' | 'tk103';
  description: string;
}

/** Modelos populares no Brasil e o protocolo que cada um utiliza. */
export const DEVICE_MODELS: DeviceModel[] = [
  { id: 'gt06', name: 'GT06 / GT06N / GT06E (Concox e clones)', protocol: 'gt06', description: 'Modelo mais comum nos "rastreadores com app sem mensalidade" (Mercado Livre / Shopee). Inclui TR02, TK300, JM-VL01, WeTrack, ET300, GT02A, X3, CRX1, E3+.' },
  { id: 'j16', name: 'J16 / J16A / J16B (4G, Quectel)', protocol: 'gt06', description: 'Mini rastreador 2G+4G muito vendido com chip M2M. Protocolo GT06, mas precisa de GPRSON e seleção de protocolo (SZCS#PTL_SEL=2) em alguns firmwares.' },
  { id: 'jm-vl01', name: 'Jimi JM-VL01 / VL02 / VL03', protocol: 'gt06', description: 'Rastreadores Jimi IoT (Concox). Usam protocolo GT06 com comandos RELAY.' },
  { id: 'e3', name: 'E3 / E3+ / E4 (Ensen / Multitek)', protocol: 'gt06', description: 'Rastreadores chineses populares de motos. Protocolo GT06.' },
  { id: 'st901', name: 'Sinotrack ST-901 / ST-901M / ST-906', protocol: 'h02', description: 'Muito vendido para motos e carros com relé. Protocolo H02 (texto).' },
  { id: 'st915', name: 'Sinotrack ST-915 / ST-903', protocol: 'h02', description: 'Sinotrack portáteis/bateria. Protocolo H02.' },
  { id: 'tk103', name: 'Coban TK103 / TK103A / TK103B / GPS103', protocol: 'tk103', description: 'Clássico Coban com relé de bloqueio. Protocolo TK103 (texto).' },
  { id: 'tk303', name: 'Coban TK303 / TK104 / TK106 / GPS303', protocol: 'tk103', description: 'Coban série 300/100. Protocolo TK103 (texto).' },
];

export const CARRIERS: Record<string, { name: string; apn: string; user: string; pass: string }> = {
  vivo: { name: 'Vivo', apn: 'zap.vivo.com.br', user: 'vivo', pass: 'vivo' },
  claro: { name: 'Claro', apn: 'claro.com.br', user: 'claro', pass: 'claro' },
  tim: { name: 'TIM', apn: 'timbrasil.br', user: 'tim', pass: 'tim' },
  oi: { name: 'Oi', apn: 'gprs.oi.com.br', user: 'oi', pass: 'oi' },
  algar: { name: 'Algar', apn: 'algar.br', user: 'algar', pass: 'algar' },
  arqia: { name: 'Arqia (M2M)', apn: 'arqia.br', user: 'arqia', pass: 'arqia' },
  m2m_vivo: { name: 'Vivo M2M', apn: 'm2m.vivo.com.br', user: 'vivo', pass: 'vivo' },
  m2m_claro: { name: 'Claro M2M', apn: 'm2m.claro.com.br', user: 'claro', pass: 'claro' },
  smart_vivo: { name: 'Vivo Smart M2M (chips de revenda)', apn: 'smart.m2m.vivo.com.br', user: 'vivo', pass: 'vivo' },
  allcom_vivo: { name: 'Allcom (Vivo)', apn: 'allcom.vivo.com.br', user: 'allcom', pass: 'allcom' },
  allcom_claro: { name: 'Allcom (Claro)', apn: 'allcom.claro.com.br', user: 'allcom', pass: 'allcom' },
  allcom_algar: { name: 'Allcom (Algar)', apn: 'allcom.br', user: 'allcom', pass: 'allcom' },
  allcom_arqia: { name: 'Allcom (Arqia)', apn: 'allcom.arquia.com.br', user: 'allcom', pass: 'allcom' },
  m2data_algar: { name: 'M2Data (Algar)', apn: 'm2data.algar.br', user: 'algar', pass: 'algar' },
  virtueyes: { name: 'Virtueyes', apn: 'virtueyes.com.br', user: 'virtu', pass: 'virtu' },
  tmdata_vivo: { name: 'Tmdata (Vivo)', apn: 'tmdata.vivo.com.br', user: 'tmdata', pass: 'tmdata' },
  tmdata_claro: { name: 'Tmdata (Claro)', apn: 'tmdata.claro.com.br', user: 'tmdata', pass: 'tmdata' },
  tmdata_tim: { name: 'Tmdata (TIM)', apn: 'tmdata.tim.br', user: 'tmdata', pass: 'tmdata' },
  link_tns: { name: 'Link Solutions / TNS', apn: 'linksolutions.br', user: 'link', pass: 'link' },
  other: { name: 'Outra (informar manualmente)', apn: 'APN_DA_OPERADORA', user: '', pass: '' },
};

export interface SetupStep {
  title: string;
  sms: string;
  note?: string;
}

export interface SetupInstructions {
  model: DeviceModel;
  carrier: { name: string; apn: string };
  host: string;
  port: number;
  password: string;
  steps: SetupStep[];
  tips: string[];
}

export function buildSetupInstructions(opts: { model?: string; carrier?: string; imei?: string; settings: AppSettings }): SetupInstructions {
  const model = DEVICE_MODELS.find((m) => m.id === opts.model) ?? DEVICE_MODELS[0];
  const carrier = CARRIERS[opts.carrier ?? 'vivo'] ?? CARRIERS.vivo;
  const host = opts.settings.public_host || 'SEU_IP_OU_DOMINIO';
  const port = opts.settings.tcp_port;
  const pwd = opts.settings.device_default_password || '123456';
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const steps: SetupStep[] = [];
  const tips: string[] = [
    'Insira um chip com plano de dados ativo (basta 50 MB/mês por rastreador) e desative o PIN do chip antes.',
    'Envie os SMS a partir de um celular para o número do chip que está no rastreador. Aguarde a resposta de confirmação entre um comando e outro.',
    'Instale o rastreador com a antena GPS voltada para cima e sem metal por cima; leve o veículo para área aberta na primeira ativação.',
    `Após configurar, o rastreador deve aparecer automaticamente nesta plataforma (menu Rastreadores) com o IMEI${opts.imei ? ` ${opts.imei}` : ''}. Depois, vincule-o ao veículo do cliente.`,
  ];

  if (model.protocol === 'gt06') {
    steps.push({ title: 'Configurar APN da operadora', sms: `APN,${carrier.apn}${carrier.user ? `,${carrier.user},${carrier.pass}` : ''}#`, note: 'Resposta esperada: "OK" ou "APN: ..."' });
    steps.push({
      title: 'Apontar para o servidor RastroCar',
      sms: isIp ? `SERVER,0,${host},${port},0#` : `SERVER,1,${host},${port},0#`,
      note: 'O primeiro parâmetro é 0 para IP e 1 para domínio (DNS).',
    });
    if (model.id === 'j16') {
      steps.push({ title: 'Ligar a transmissão GPRS', sms: 'GPRSON,1#', note: 'Alguns J16 saem de fábrica com o GPRS desligado e nunca abrem conexão com o servidor.' });
      steps.push({ title: 'Selecionar o protocolo GT06', sms: 'SZCS#PTL_SEL=2', note: 'Sem "#" no final. Garante que o aparelho fale GT06 com a plataforma.' });
    }
    steps.push({ title: 'Ajustar fuso horário (Brasília)', sms: 'GMT,W,3,0#', note: 'Alguns modelos usam "TIMEZONE,-3#". A plataforma trata os horários em UTC, então este passo é opcional.' });
    steps.push({ title: 'Intervalo de envio de posição', sms: 'TIMER,10,30#', note: '10 s em movimento e 30 s parado. Ajuste conforme o plano de dados.' });
    steps.push({ title: 'Ativar detecção de ignição (ACC)', sms: 'ACCREP,ON#', note: 'Necessário para o mapeamento correto de viagens (início/fim por ignição).' });
    steps.push({ title: 'Reiniciar o rastreador', sms: 'RESET#' });
    steps.push({ title: 'Consultar configuração (opcional)', sms: 'PARAM#', note: 'Verifique se o servidor e a APN foram gravados corretamente.' });
    tips.push('Bloqueio do motor: a plataforma envia "RELAY,1#" (bloquear) e "RELAY,0#" (liberar). Em modelos antigos que usam "DYD"/"HFYD", selecione a variante nos comandos.');
    tips.push('Se o rastreador não conectar, envie "STATUS#" ou "GPRSSET#" para verificar o estado do GPRS e "URL#" para ver o servidor gravado.');
    tips.push('Chips M2M de revenda costumam receber SMS sem responder: envie os comandos mesmo assim e confira a chegada do aparelho no menu Rastreadores. Se não conectar, teste com um chip comum (Vivo/Claro/TIM) para separar problema de chip/APN de problema do aparelho.');
    tips.push('Em último caso, "FACTORY#" restaura o padrão de fábrica; depois refaça APN e SERVER.');
  } else if (model.protocol === 'h02') {
    const p = pwd.padStart(4, '0').slice(-4);
    steps.push({ title: 'Configurar APN da operadora', sms: `803${p} ${carrier.apn}${carrier.user ? ` ${carrier.user} ${carrier.pass}` : ''}`, note: 'Senha padrão do ST-901 é 0000. Resposta esperada: "SET APN OK".' });
    steps.push({ title: 'Apontar para o servidor RastroCar', sms: `804${p} ${host} ${port}`, note: 'Resposta esperada: "SET IP OK". Aceita IP ou domínio.' });
    steps.push({ title: 'Intervalo de envio de posição (segundos)', sms: `805${p} 10`, note: 'Resposta esperada: "SET TIME OK".' });
    steps.push({ title: 'Fuso horário (opcional)', sms: `896${p}E-3`, note: 'Alguns firmwares usam "896${p}W3". Não interfere na plataforma.' });
    steps.push({ title: 'Reiniciar o rastreador', sms: `RESET${p}`, note: 'Ou desligue e ligue a alimentação.' });
    tips.push(`Bloqueio: a plataforma envia o comando S20 pela rede. Por SMS, o equivalente é "555${p}" (bloquear) e "666${p}" (liberar).`);
    tips.push(`Para consultar o estado: "CHECK${p}" ou "666${p}" para ver posição por SMS.`);
  } else {
    steps.push({ title: 'Iniciar configuração (senha padrão 123456)', sms: `begin${pwd}`, note: 'Resposta esperada: "begin ok".' });
    steps.push({ title: 'Configurar APN da operadora', sms: `apn${pwd} ${carrier.apn}`, note: 'Resposta: "apn ok". Se a operadora exigir usuário/senha: "up' + pwd + ' ' + (carrier.user || 'usuario') + ' ' + (carrier.pass || 'senha') + '".' });
    steps.push({ title: 'Apontar para o servidor RastroCar', sms: `adminip${pwd} ${host} ${port}`, note: 'Resposta: "adminip ok".' });
    steps.push({ title: 'Ativar modo GPRS (TCP)', sms: `gprs${pwd}`, note: 'Resposta: "GPRS ok".' });
    steps.push({ title: 'Envio contínuo de posição', sms: `fix010s***n${pwd}`, note: 'A cada 10 s, sem limite de quantidade.' });
    steps.push({ title: 'Ativar horário (opcional)', sms: `time zone${pwd} -3` });
    tips.push(`Bloqueio: a plataforma envia "J" (bloquear) e "K" (liberar). Por SMS: "stop${pwd}" e "resume${pwd}".`);
  }

  return { model, carrier: { name: carrier.name, apn: carrier.apn }, host, port, password: pwd, steps, tips };
}
