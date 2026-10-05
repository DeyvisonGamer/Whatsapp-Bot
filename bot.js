const fs = require('fs');
const path = require('path');
const stringSimilarity = require('string-similarity');
const { estaPausado, pausar } = require('./painel-cliente');

const FRETES_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbzG4L6b0kymvSf0fNZu1wY4RP8dCtlWD4_hpqZn7hYfDRTb_LiHQyznPGtziaxy660E/exec';
const FRETES_FALLBACK_PATH = path.join(__dirname, 'fretes.json');
const CACHE_FRETES_MINUTOS = 10;
const LIMIAR_SIMILARIDADE = 0.35;
const LIMIAR_SIMILARIDADE_CIDADE = 0.55;

// ==== Dados do Pix (PREENCHA AQUI) ====
// Troque pela chave Pix real da loja (CPF/CNPJ, e-mail, telefone ou chave aleatória)
// e pelo nome que deve aparecer pro cliente confirmar que é a conta certa.
const PIX_CHAVE = 'COLE_AQUI_A_CHAVE_PIX';
const PIX_NOME_FAVORECIDO = 'COLE_AQUI_O_NOME_DO_FAVORECIDO';

const LINK_SITE_STATUS = 'https://luzebrilhocosmeticos.netlify.app';

// Trecho fixo que o carrinho.html sempre coloca no início da mensagem de
// pedido finalizado (ver função finalizarPedido() em carrinho.html) — é
// nele que reconhecemos que a mensagem recebida é um pedido, e não uma
// pergunta qualquer do cliente.
const MARCADOR_PEDIDO_FINALIZADO = 'gostaria de confirmar meu pedido';

const MENSAGEM_FALLBACK =
  'Oi! Não consegui entender sua pergunta automaticamente 🙏 Já vamos te chamar por aqui, só um instante!';
const MENSAGEM_CIDADE_NAO_CADASTRADA =
  'Ainda não localizei sua cidade/CEP no nosso cadastro de frete 🙏 Me manda o nome da cidade ou o CEP completo que eu confirmo certinho, ou aguarde que já te respondemos por aqui!';

const SAUDACAO_RESPOSTA =
  '✨ Olá!☺️ Seja bem-vindo(a) à Luz e Brilho Cosméticos e Acessórios.\n\n' +
  'Em que podemos ajudar hoje?\n\n' +
  'Envie sua dúvida e responderemos o mais breve possível.🤎\n\n' +
  'Se preferir falar direto com um atendente, é só mandar *"quero atendimento humano"* que a gente já chama alguém pra te ajudar! 🙋';

// ==== Atendimento humano ====
// Os números notificados quando um cliente pede atendimento humano ficam
// configurados no index.js (NUMEROS_ATENDIMENTO_HUMANO), já que é lá que
// o bot tem acesso ao socket do WhatsApp pra mandar a notificação.

// Frases/expressões que disparam a notificação de atendimento humano.
// A checagem é por "contém" (normalizada, sem acento) + uma checagem extra
// por similaridade pra pegar variações de digitação.
const FRASES_ATENDIMENTO_HUMANO = [
  'atendimento humano',
  'quero atendimento humano',
  'falar com atendente',
  'falar com um atendente',
  'falar com uma pessoa',
  'falar com uma pessoa de verdade',
  'falar com humano',
  'quero falar com humano',
  'quero falar com um humano',
  'quero um humano',
  'quero um atendente',
  'preciso de atendimento humano',
  'preciso falar com alguem',
  'quero falar com alguem',
  'atendente humano',
  'humano por favor',
  'falar com atendimento',
  'quero suporte humano',
  'atendente de verdade',
  'pessoa de verdade',
  'chama um atendente',
  'chamar atendente',
];

const RESPOSTA_ATENDIMENTO_HUMANO =
  'Combinado! 🙋 Já avisei nossa equipe e alguém vai te atender por aqui em instantes. Só um instantinho, por favor!';

const SAUDACOES = [
  'oi', 'ola', 'opa', 'oii', 'oiii', 'oie', 'oieee',
  'eae', 'eai', 'e ai', 'e air',
  'bom dia', 'boa tarde', 'boa noite',
  'hello', 'hey', 'hi', 'alo', 'alô',
  'oi tudo bem', 'ola tudo bem', 'tudo bem',
];

const PALAVRAS_FRETE = [
  'frete', 'fretes', 'entrega', 'entregas', 'entregar', 'entregam',
  'taxa', 'taxas', 'valor da entrega', 'valor do frete', 'quanto custa',
  'quanto e', 'quanto é', 'chega em quanto tempo', 'prazo de entrega',
  'vcs entregam', 'voces entregam', 'entrega em', 'entregam em',
  'manda pra', 'manda para', 'chega ate', 'chega até',
];

const FAQ = [
  {
    palavras: [
      'cartao', 'cartão', 'cartoes', 'cartões', 'credito', 'crédito', 'debito', 'débito',
      'pix', 'forma de pagamento', 'formas de pagamento', 'como pagar', 'aceita cartao',
      'aceitam cartao', 'aceita pix', 'pagamento', 'pagamentos', 'dinheiro',
    ],
    resposta: 'Sim! Aceitamos cartão de crédito, debitó, Pix e dinheiro na hora da entrega 💳✅',
  },
  {
    palavras: [
      'marca', 'marcas', 'cosmetico', 'cosmético', 'cosmeticos', 'cosméticos',
      'maquiagem', 'maquiagens', 'make', 'makes', 'pronta entrega', 'tem em estoque',
      'vcs tem', 'voces tem', 'vocês têm', 'tem essa marca',
    ],
    resposta:
      'Trabalhamos com diversas marcas de cosméticos e maquiagem com pronta entrega 💄. Me diga o que você procura que já te confirmo se temos em estoque!',
  },
  {
    palavras: [
      'nao encontrei', 'não encontrei', 'nao achei', 'não achei', 'encomenda',
      'encomendas', 'encomendar', 'pedir encomenda', 'produto especifico',
      'produto específico', 'consigo essa marca', 'voces conseguem', 'vcs conseguem',
    ],
    resposta:
      'Sim, trazemos por encomenda! 📦 Me conta qual produto você está procurando que a gente verifica disponibilidade e prazo pra você.',
  },
  {
    palavras: [
      'presente', 'presentes', 'ultima hora', 'última hora', 'de ultima hora',
      'embalado', 'embalar', 'embrulhado', 'embrulhar', 'hoje', 'pra hoje',
      'consigo pra hoje', 'entrega hoje', 'urgente',
    ],
    resposta:
      'Depende do horário do pedido, mas fazemos o possível para entregar embalado ainda hoje 🎁. Me diga o produto e seu bairro que já te confirmo!',
  },
  {
    palavras: [
      'tom', 'tons', 'base', 'bases', 'corretivo', 'corretivos', 'cor certa',
      'tom certo', 'qual tom', 'qual base', 'escolher a base', 'escolher tom',
    ],
    resposta:
      'Ótima pergunta ✨ Pra acertar o tom da base ou corretivo, me manda uma foto do seu rosto com luz natural (sem filtro) que a gente te ajuda a escolher, ou se preferir pode vir aqui na loja pra testar!',
  },
  {
    palavras: [
      'original', 'originais', 'novo', 'novos', 'nova', 'novas', 'autentico',
      'autêntico', 'autenticos', 'autênticos', 'e original', 'é original',
      'produto original', 'genuino', 'genuíno',
    ],
    resposta: 'Sim! Todos os produtos do nosso catálogo são 100% originais e novos ✅',
  },
  {
    palavras: [
      'retirar', 'retirada', 'buscar', 'busco', 'so entrega', 'só entrega',
      'so tem entrega', 'tem retirada', 'posso retirar', 'retiro',
    ],
    resposta: 'Sim, você pode retirar seu pedido direto com a gente 🏠 ou receber por entrega, como preferir!',
  },
  {
    palavras: [
      'link da loja', 'link do site', 'link do app', 'link da app', 'site da loja',
      'loja online', 'aplicativo', 'baixar app', 'baixar o app', 'apk', 'link',
      'site', 'app', 'onde compro', 'onde eu compro', 'como compro', 'catalogo',
      'catálogo', 'ver produtos', 'lista de produtos',
    ],
    resposta:
      'Claro! 😊\n\n🛍️ Site da loja: https://luzebrilhocosmeticos.netlify.app/index.html\n📲 Baixar o app: https://luzebrilhocosmeticos.netlify.app/baixar-app.html',
  },
  {
    palavras: [
      'horario', 'horário', 'horarios', 'horários', 'que horas', 'abre',
      'fecha', 'funcionamento', 'atendimento', 'que horas abre', 'que horas fecha',
    ],
    resposta: 'Nosso atendimento por aqui é feito o mais rápido possível! Se quiser ver os produtos a qualquer hora, o site fica disponível 24h 😉',
  },
];

let fretesCache = null;
let fretesCacheTimestamp = 0;

function cacheFretesValido() {
  if (!fretesCache) return false;
  const idadeMinutos = (Date.now() - fretesCacheTimestamp) / 1000 / 60;
  return idadeMinutos < CACHE_FRETES_MINUTOS;
}

function normalizarListaFretes(lista) {
  if (!Array.isArray(lista)) return [];
  return lista
    .map((item) => ({
      cepInicio: String(item.cepInicio ?? item['CEP Inicial'] ?? item.cepinicio ?? '').trim(),
      cepFim: String(item.cepFim ?? item['CEP Final'] ?? item.cepfim ?? '').trim(),
      descricao: String(item.descricao ?? item['Descrição'] ?? item.Descricao ?? item.Cidade ?? item.cidade ?? '').trim(),
      valorPadrao: Number(item.valorPadrao ?? item['Frete Padrão'] ?? item.fretePadrao ?? 0),
      valorExpresso: Number(item.valorExpresso ?? item['Frete Expresso'] ?? item.freteExpresso ?? 0),
      gratisAcimaDe: Number(item.gratisAcimaDe ?? item['Grátis Acima De'] ?? item.gratisAcimaDe ?? 0),
    }))
    .filter((item) => item.cepInicio && item.cepFim);
}

function carregarFretesLocalFallback() {
  try {
    const conteudo = fs.readFileSync(FRETES_FALLBACK_PATH, 'utf-8');
    return normalizarListaFretes(JSON.parse(conteudo));
  } catch (erro) {
    console.error('Não consegui ler o fretes.json local de fallback:', erro.message);
    return [];
  }
}

async function obterFretes() {
  if (cacheFretesValido()) {
    return fretesCache;
  }

  if (!FRETES_WEBAPP_URL || FRETES_WEBAPP_URL.includes('COLE_AQUI')) {
    fretesCache = carregarFretesLocalFallback();
    fretesCacheTimestamp = Date.now();
    return fretesCache;
  }

  try {
    const resposta = await fetch(FRETES_WEBAPP_URL);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const dados = await resposta.json();
    const lista = normalizarListaFretes(dados);

    if (lista.length === 0) throw new Error('Planilha devolveu lista vazia ou em formato inesperado');

    fretesCache = lista;
    fretesCacheTimestamp = Date.now();

    try {
      fs.writeFileSync(FRETES_FALLBACK_PATH, JSON.stringify(dados, null, 2), 'utf-8');
    } catch (erroEscrita) {
      console.error('Não consegui atualizar o fretes.json local (não é crítico):', erroEscrita.message);
    }

    return fretesCache;
  } catch (erro) {
    console.error('Falha ao buscar fretes da planilha, usando fallback local:', erro.message);
    const listaFallback = carregarFretesLocalFallback();
    fretesCache = listaFallback;
    fretesCacheTimestamp = Date.now();
    return fretesCache;
  }
}

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatarReais(valor) {
  return `R$ ${Number(valor).toFixed(2).replace('.', ',')}`;
}

function ehSaudacao(mensagemUsuario) {
  const norm = normalizar(mensagemUsuario);
  if (!norm) return false;

  const palavras = norm.split(/\s+/);
  if (palavras.length > 4) return false;

  return SAUDACOES.some((s) => {
    const sNorm = normalizar(s);
    return norm === sNorm || norm.startsWith(sNorm + ' ') || sNorm.startsWith(norm);
  });
}

function ehPedidoAtendimentoHumano(mensagemUsuario) {
  const norm = normalizar(mensagemUsuario);
  if (!norm) return false;

  if (FRASES_ATENDIMENTO_HUMANO.some((frase) => norm.includes(normalizar(frase)))) {
    return true;
  }

  // Fallback por similaridade, pra pegar variações/erros de digitação
  // (ex: "kero atendimento umano", "flar com atendente").
  return FRASES_ATENDIMENTO_HUMANO.some(
    (frase) => stringSimilarity.compareTwoStrings(norm, normalizar(frase)) >= 0.8
  );
}

function mensagemPareceSerSobreFrete(msgNormalizada) {
  return PALAVRAS_FRETE.some((p) => msgNormalizada.includes(normalizar(p)));
}

function extrairCep(mensagemUsuario) {
  const match = String(mensagemUsuario || '').match(/(\d{5})-?(\d{3})/);
  if (!match) return null;
  return match[1] + match[2];
}

function respostaFrete(faixa) {
  const nomeLocal = faixa.descricao || 'sua região';
  if (Number(faixa.valorPadrao) === 0) {
    return `Para ${nomeLocal} o frete é GRÁTIS! 🛵✨`;
  }
  let resp = `Para ${nomeLocal} o valor do frete é ${formatarReais(faixa.valorPadrao)} 🛵`;
  if (faixa.valorExpresso && Number(faixa.valorExpresso) > 0) {
    resp += `\n(Frete expresso: ${formatarReais(faixa.valorExpresso)})`;
  }
  if (faixa.gratisAcimaDe && Number(faixa.gratisAcimaDe) > 0) {
    resp += `\nFrete grátis em compras acima de ${formatarReais(faixa.gratisAcimaDe)}!`;
  }
  return resp;
}

function buscarCidadeNosFretes(mensagemUsuario, fretes) {
  const msgNormalizada = normalizar(mensagemUsuario);
  if (!msgNormalizada || !fretes || fretes.length === 0) return null;

  const cep = extrairCep(mensagemUsuario);
  if (cep) {
    const cepNum = Number(cep);
    const faixa = fretes.find((f) => {
      if (!f.cepInicio || !f.cepFim) return false;
      return cepNum >= Number(f.cepInicio) && cepNum <= Number(f.cepFim);
    });
    if (faixa) return faixa;
  }

  for (const faixa of fretes) {
    const descNorm = normalizar(faixa.descricao || '');
    if (msgNormalizada === descNorm) {
      return faixa;
    }
  }

  for (const faixa of fretes) {
    const descNorm = normalizar(faixa.descricao || '');
    if (!descNorm) continue;
    
    if (descNorm.length >= 4 && msgNormalizada.includes(descNorm)) {
      return faixa;
    }
  }

  const palavrasMsg = msgNormalizada.split(/\s+/).filter((p) => p.length >= 3);
  let melhorFaixa = null;
  let melhorScore = 0;

  for (const faixa of fretes) {
    const descNorm = normalizar(faixa.descricao || '');
    if (!descNorm) continue;

    const scoreCompleto = stringSimilarity.compareTwoStrings(msgNormalizada, descNorm);
    if (scoreCompleto > melhorScore) {
      melhorScore = scoreCompleto;
      melhorFaixa = faixa;
    }

    const palavrasDesc = descNorm.split(/\s+/);
    for (const pMsg of palavrasMsg) {
      for (const pDesc of palavrasDesc) {
        if (pDesc.length < 3) continue;
        const score = stringSimilarity.compareTwoStrings(pMsg, pDesc);
        if (score > melhorScore) {
          melhorScore = score;
          melhorFaixa = faixa;
        }
      }
    }
  }

  if (melhorScore >= LIMIAR_SIMILARIDADE_CIDADE) {
    return melhorFaixa;
  }

  return null;
}

/**
 * Detecta se a mensagem recebida é a mensagem automática que o carrinho.html
 * monta e manda pro WhatsApp quando o cliente finaliza a compra no site.
 */
function ehPedidoFinalizado(mensagemUsuario) {
  const norm = normalizar(mensagemUsuario);
  return norm.includes(normalizar(MARCADOR_PEDIDO_FINALIZADO));
}

/**
 * Extrai a forma de pagamento escolhida a partir da linha
 * "Forma de pagamento: X" que o carrinho.html sempre inclui na mensagem.
 */
function extrairFormaPagamento(mensagemUsuario) {
  const match = String(mensagemUsuario || '').match(/forma de pagamento:\s*([^\n]+)/i);
  return match ? match[1].trim() : '';
}

function ehPagamentoPix(formaPagamento) {
  return normalizar(formaPagamento).includes('pix');
}

function ehPagamentoCartao(formaPagamento) {
  const norm = normalizar(formaPagamento);
  return norm.includes('cartao') || norm.includes('credito') || norm.includes('debito');
}

function respostaPedidoFinalizado(mensagemUsuario) {
  const formaPagamento = extrairFormaPagamento(mensagemUsuario);

  const rodape =
    `Seu pedido foi enviado para nossa equipe, por favor aguarde a confirmação. ` +
    `Para acompanhar o status do seu pedido, acesse sua conta no nosso site ${LINK_SITE_STATUS} 🤎`;

  if (ehPagamentoPix(formaPagamento)) {
    return (
      `Recebemos seu pedido! 🎉\n\n` +
      `Para finalizar, faça o pagamento via Pix:\n` +
      `🔑 Chave Pix: ${PIX_CHAVE}\n` +
      `👤 Favorecido: ${PIX_NOME_FAVORECIDO}\n\n` +
      `Depois de pagar, é só mandar o comprovante aqui mesmo. ${rodape}`
    );
  }

  if (ehPagamentoCartao(formaPagamento)) {
    return (
      `Recebemos seu pedido! 🎉\n\n` +
      `O pagamento no cartão é feito na hora da entrega 💳. ${rodape}`
    );
  }

  return `Recebemos seu pedido! 🎉\n\n${rodape}`;
}

function encontrarResposta(mensagemUsuario) {
  const msgNormalizada = normalizar(mensagemUsuario);

  for (const item of FAQ) {
    for (const palavra of item.palavras) {
      if (msgNormalizada.includes(normalizar(palavra))) {
        return item.resposta;
      }
    }
  }

  let melhorScore = 0;
  let melhorResposta = null;

  for (const item of FAQ) {
    for (const palavra of item.palavras) {
      const score = stringSimilarity.compareTwoStrings(msgNormalizada, normalizar(palavra));
      if (score > melhorScore) {
        melhorScore = score;
        melhorResposta = item.resposta;
      }
    }
  }

  if (melhorScore >= LIMIAR_SIMILARIDADE) {
    return melhorResposta;
  }

  return null;
}

async function gerarResposta(mensagemUsuario, jidCliente) {
  if (jidCliente && estaPausado(jidCliente)) {
    return null;
  }

  if (ehPedidoAtendimentoHumano(mensagemUsuario)) {
    // Pausa o bot pra esse cliente, já que a partir daqui um atendente
    // humano vai assumir a conversa (a notificação pros números é
    // disparada pelo index.js, que tem acesso ao socket do WhatsApp).
    if (jidCliente) pausar(jidCliente);
    return RESPOSTA_ATENDIMENTO_HUMANO;
  }

  if (ehPedidoFinalizado(mensagemUsuario)) {
    const resposta = respostaPedidoFinalizado(mensagemUsuario);
    // Só pausa pro atendente assumir quando é Pix, já que aí precisa
    // conferir o comprovante manualmente. Cartão e dinheiro são
    // confirmados/pagos na entrega, então o bot continua respondendo
    // normalmente o resto da conversa.
    if (jidCliente && ehPagamentoPix(extrairFormaPagamento(mensagemUsuario))) {
      pausar(jidCliente);
    }
    return resposta;
  }

  if (ehSaudacao(mensagemUsuario)) {
    return SAUDACAO_RESPOSTA;
  }

  const fretes = await obterFretes();
  const faixaEncontrada = buscarCidadeNosFretes(mensagemUsuario, fretes);
  if (faixaEncontrada) {
    return respostaFrete(faixaEncontrada);
  }

  const respostaFaq = encontrarResposta(mensagemUsuario);
  if (respostaFaq) return respostaFaq;

  const msgNormalizada = normalizar(mensagemUsuario);
  if (mensagemPareceSerSobreFrete(msgNormalizada)) {
    return MENSAGEM_CIDADE_NAO_CADASTRADA;
  }

  return MENSAGEM_FALLBACK;
}

module.exports = {
  gerarResposta,
  normalizar,
  ehSaudacao,
  buscarCidadeNosFretes,
  ehPedidoFinalizado,
  extrairFormaPagamento,
  ehPagamentoPix,
  ehPagamentoCartao,
  respostaPedidoFinalizado,
  ehPedidoAtendimentoHumano,
};