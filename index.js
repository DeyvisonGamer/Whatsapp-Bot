// ============================================================================
// 1. CARREGAMENTO INICIAL DAS VARIÁVEIS DE AMBIENTE
// ============================================================================
require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const path = require('path');

const {
  gerarResposta,
  ehPedidoAtendimentoHumano,
} = require('./bot');

const {
  registrarMensagemRecebida,
  registrarMensagemBot,
} = require('./painel-cliente');

const {
  iniciarPainel,
} = require('./painel-server');

const {
  enviarEmailAtendimentoHumano,
} = require('./email-notificacao');

const {
  criarUsuario,
  listarUsuarios,
  removerUsuario,
} = require('./painel-usuarios');

const {
  instagramConfigurado,
  iniciarInstagram,
  enviarMensagemInstagram,
} = require('./instagram');


// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

const AUTH_FOLDER = path.join(__dirname, 'auth_info');

// HidenCloud normalmente fornece a porta através de process.env.PORT
const PORTA_PAINEL = Number(process.env.PORT) || 24629;


// ============================================================================
// SENHA MESTRA PARA COMANDOS ADMINISTRATIVOS
// ============================================================================
//
// Pode ser configurada através de:
//
// SENHA_MESTRA_ADMIN=suasenha
//
// ou como argumento:
//
// node index.js suasenha
//
// Se nenhuma for configurada, os comandos administrativos ficam desativados.
// ============================================================================

const SENHA_MESTRA_ADMIN =
  process.env.SENHA_MESTRA_ADMIN ||
  process.argv[2] ||
  null;


// ============================================================================
// COMANDOS ADMINISTRATIVOS VIA WHATSAPP
// ============================================================================

/**
 * Comandos disponíveis:
 *
 * /criarusuario SENHA_MESTRA login senha Nome Completo
 * /listarusuarios SENHA_MESTRA
 * /removerusuario SENHA_MESTRA login
 */

function processarComandoAdmin(texto) {
  if (!texto || typeof texto !== 'string') {
    return null;
  }

  const partes = texto.trim().split(/\s+/);

  const comando = (partes[0] || '').toLowerCase();

  const comandosPermitidos = [
    '/criarusuario',
    '/listarusuarios',
    '/removerusuario',
  ];

  // Não é comando administrativo
  if (!comandosPermitidos.includes(comando)) {
    return null;
  }

  // Senha mestra não configurada
  if (!SENHA_MESTRA_ADMIN) {
    return (
      '⚠️ Comandos de admin estão desativados.\n\n' +
      'Configure SENHA_MESTRA_ADMIN nas variáveis de ambiente do serviço.'
    );
  }

  const senhaEnviada = partes[1] || '';

  // Senha incorreta
  if (senhaEnviada !== SENHA_MESTRA_ADMIN) {
    return '⛔ Senha mestra incorreta.';
  }

  try {
    // ========================================================================
    // CRIAR USUÁRIO
    // ========================================================================

    if (comando === '/criarusuario') {
      // /criarusuario SENHA login senha Nome Completo

      const login = partes[2];
      const senha = partes[3];
      const nome = partes.slice(4).join(' ');

      if (!login || !senha || !nome) {
        return (
          '❌ Uso correto:\n' +
          '/criarusuario SENHA_MESTRA login senha Nome Completo\n\n' +
          'Exemplo:\n' +
          '/criarusuario minhaSenha123 joana 12345678 Joana Silva'
        );
      }

      criarUsuario(login, senha, nome);

      return (
        '✅ Usuário criado com sucesso!\n\n' +
        `👤 Login: ${login}\n` +
        `🔑 Senha: ${senha}\n` +
        `📛 Nome: ${nome}\n\n` +
        'Já pode entrar no painel com esse login e senha.'
      );
    }


    // ========================================================================
    // LISTAR USUÁRIOS
    // ========================================================================

    if (comando === '/listarusuarios') {
      const usuarios = listarUsuarios();

      if (!usuarios || !usuarios.length) {
        return '📋 Nenhum atendente cadastrado ainda.';
      }

      const lista = usuarios
        .map((usuario) => {
          return `• ${usuario.usuario} (${usuario.nome})`;
        })
        .join('\n');

      return (
        '📋 Atendentes cadastrados:\n\n' +
        lista
      );
    }


    // ========================================================================
    // REMOVER USUÁRIO
    // ========================================================================

    if (comando === '/removerusuario') {
      // /removerusuario SENHA login

      const login = partes[2];

      if (!login) {
        return (
          '❌ Uso correto:\n' +
          '/removerusuario SENHA_MESTRA login'
        );
      }

      removerUsuario(login);

      return `✅ Usuário "${login}" removido com sucesso.`;
    }

  } catch (erro) {
    console.error('Erro no comando administrativo:', erro);

    return (
      '❌ Erro ao executar comando administrativo:\n' +
      (erro?.message || 'Erro desconhecido.')
    );
  }

  return null;
}


// ============================================================================
// ATENDIMENTO HUMANO
// ============================================================================

async function notificarAtendimentoHumano(
  sock,
  remetente,
  nomeContato,
  mensagemCliente
) {
  try {
    const numeroCliente = String(remetente).split('@')[0];

    console.log(
      `🙋 [Atendimento Humano] Gatilho detectado na mensagem de ` +
      `${nomeContato || numeroCliente}.`
    );

    await enviarEmailAtendimentoHumano(
      nomeContato,
      numeroCliente,
      mensagemCliente
    );

    console.log(
      '📧 [Atendimento Humano] E-mail enviado com sucesso.'
    );

  } catch (erro) {
    console.error(
      '❌ Erro ao enviar notificação de atendimento humano:',
      erro
    );

    throw erro;
  }
}


// ============================================================================
// INSTAGRAM DIRECT
// ============================================================================

// ============================================================================
// PROCESSAR MENSAGEM DO INSTAGRAM
// ============================================================================
//
// `remetenteId` agora é o próprio nome de usuário (@usuario) do Instagram,
// já capturado pelo Puppeteer direto da tela do Direct — não precisa mais
// buscar o nome via API separada.

async function processarMensagemInstagram(
  remetenteId,
  textoRecebido
) {
  if (!remetenteId || !textoRecebido) {
    return;
  }

  try {
    const nomeContato = remetenteId;

    console.log(
      `📩 [Instagram] Mensagem de ` +
      `${nomeContato || remetenteId}: ${textoRecebido}`
    );


    // Registrar mensagem do cliente
    registrarMensagemRecebida(
      remetenteId,
      textoRecebido,
      nomeContato,
      'instagram'
    );


    // Verificar atendimento humano
    const pediuHumano =
      ehPedidoAtendimentoHumano(textoRecebido);

    if (pediuHumano) {
      try {
        console.log(
          `🙋 [Atendimento Humano] Gatilho detectado no Instagram ` +
          `(${nomeContato || remetenteId}).`
        );

        await enviarEmailAtendimentoHumano(
          nomeContato,
          `Instagram: ${remetenteId}`,
          textoRecebido
        );

      } catch (erro) {
        console.error(
          '❌ Erro ao notificar atendimento humano pelo Instagram:',
          erro
        );
      }
    }


    // Gerar resposta
    const respostaFinal = await gerarResposta(
      textoRecebido,
      remetenteId
    );


    // null significa que a conversa está com atendente humano
    if (respostaFinal === null) {
      console.log(
        `🙋 [Painel] Conversa do Instagram com ` +
        `${nomeContato || remetenteId} está com atendente humano.`
      );

      return;
    }


    // Enviar resposta
    await enviarMensagemInstagram(
      remetenteId,
      respostaFinal
    );


    // Registrar resposta no painel
    registrarMensagemBot(
      remetenteId,
      respostaFinal
    );


    console.log(
      `📤 [Instagram] Respondido: ` +
      `${String(respostaFinal).substring(0, 60)}...`
    );

  } catch (erro) {
    console.error(
      '❌ Erro ao processar mensagem do Instagram:',
      erro
    );
  }
}


// ============================================================================
// RECONEXÃO DO WHATSAPP
// ============================================================================

let tentativasReconexao = 0;

const ESPERA_BASE_MS = 5000;
const ESPERA_MAX_MS = 60000;

let reconexaoAgendada = false;


function agendarReconexao(motivo) {
  // Evita criar vários setTimeout ao mesmo tempo
  if (reconexaoAgendada) {
    return;
  }

  reconexaoAgendada = true;

  tentativasReconexao++;

  const espera = Math.min(
    ESPERA_MAX_MS,
    ESPERA_BASE_MS * tentativasReconexao
  );

  console.log(
    `⚠️ Conexão caiu (${motivo}). ` +
    `Tentando reconectar em ${espera / 1000}s ` +
    `(tentativa ${tentativasReconexao})...`
  );

  setTimeout(() => {
    reconexaoAgendada = false;

    iniciarBot().catch((erro) => {
      console.error(
        '❌ Erro durante tentativa de reconexão:',
        erro
      );
    });

  }, espera);
}


// ============================================================================
// SOCKET ATUAL DO WHATSAPP
// ============================================================================
//
// O painel utiliza essa função para sempre pegar o socket mais recente,
// inclusive depois de uma reconexão.
// ============================================================================

let sockAtual = null;

function obterSockAtual() {
  return sockAtual;
}


// ============================================================================
// INICIAR BOT DO WHATSAPP
// ============================================================================

async function iniciarBot() {
  try {
    console.log('🔄 Inicializando conexão com WhatsApp...');

    const {
      state,
      saveCreds,
    } = await useMultiFileAuthState(AUTH_FOLDER);


    const sock = makeWASocket({
      auth: state,

      printQRInTerminal: false,

      // Aumentado para evitar problemas com servidores lentos.
      defaultQueryTimeoutMs: 120000,
    });


    sockAtual = sock;


    // Salvar credenciais automaticamente
    sock.ev.on('creds.update', saveCreds);


    // ========================================================================
    // EVENTO DE CONEXÃO
    // ========================================================================

    sock.ev.on('connection.update', (update) => {
      const {
        connection,
        lastDisconnect,
        qr,
      } = update;


      // ======================================================================
      // QR CODE
      // ======================================================================

      if (qr) {
        console.log(
          '\n📱 Escaneie o QR Code abaixo com o WhatsApp:\n'
        );

        qrcode.generate(qr, {
          small: true,
        });
      }


      // ======================================================================
      // CONECTADO
      // ======================================================================

      if (connection === 'open') {
        tentativasReconexao = 0;

        console.log(
          '✅ Bot conectado ao WhatsApp com sucesso!'
        );
      }


      // ======================================================================
      // DESCONECTADO
      // ======================================================================

      if (connection === 'close') {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        const foiDeslogado =
          statusCode === DisconnectReason.loggedOut;


        // O WhatsApp deslogou permanentemente
        if (foiDeslogado) {
          sockAtual = null;

          console.log(
            '🚪 Sessão desconectada pelo WhatsApp.'
          );

          console.log(
            '🗑️ Apague a pasta "auth_info" e reinicie o bot ' +
            'para gerar um novo QR Code.'
          );

          return;
        }


        // Qualquer outra queda tenta reconectar
        sockAtual = null;

        agendarReconexao(
          statusCode || 'motivo desconhecido'
        );
      }
    });


    // ========================================================================
    // MENSAGENS RECEBIDAS
    // ========================================================================

    sock.ev.on(
      'messages.upsert',
      async ({ messages, type }) => {

        if (type !== 'notify') {
          return;
        }

        if (!messages || !messages.length) {
          return;
        }


        // Pode haver mais de uma mensagem no evento.
        // Processamos todas para não perder mensagens.
        for (const msg of messages) {

          try {

            if (!msg?.message) {
              continue;
            }


            // Ignorar mensagens enviadas pelo próprio bot
            if (msg.key?.fromMe) {
              continue;
            }


            const remetente =
              msg.key?.remoteJid;


            if (!remetente) {
              continue;
            }


            // Ignorar grupos
            if (remetente.endsWith('@g.us')) {
              continue;
            }


            // ================================================================
            // EXTRAIR TEXTO
            // ================================================================

            const textoRecebido =
              msg.message.conversation ||
              msg.message.extendedTextMessage?.text ||
              msg.message.imageMessage?.caption ||
              msg.message.videoMessage?.caption ||
              '';


            if (!textoRecebido.trim()) {
              continue;
            }


            const nomeContato =
              msg.pushName || null;


            console.log(
              `📩 [WhatsApp] Mensagem de ` +
              `${nomeContato || remetente}: ${textoRecebido}`
            );


            // ================================================================
            // COMANDO ADMINISTRATIVO
            // ================================================================

            const respostaAdmin =
              processarComandoAdmin(textoRecebido);


            if (respostaAdmin !== null) {

              try {

                await sock.sendMessage(
                  remetente,
                  {
                    text: respostaAdmin,
                  }
                );

              } catch (erro) {

                console.error(
                  '❌ Erro ao responder comando admin:',
                  erro
                );
              }

              continue;
            }


            // ================================================================
            // REGISTRAR MENSAGEM NO PAINEL
            // ================================================================

            registrarMensagemRecebida(
              remetente,
              textoRecebido,
              nomeContato
            );


            // ================================================================
            // VERIFICAR ATENDIMENTO HUMANO
            // ================================================================

            const pediuHumano =
              ehPedidoAtendimentoHumano(textoRecebido);


            console.log(
              `🔎 [Detecção] ehPedidoAtendimentoHumano(` +
              `"${textoRecebido}") = ${pediuHumano}`
            );


            if (pediuHumano) {

              try {

                await notificarAtendimentoHumano(
                  sock,
                  remetente,
                  nomeContato,
                  textoRecebido
                );

              } catch (erro) {

                console.error(
                  '❌ Erro ao notificar atendimento humano:',
                  erro
                );
              }
            }


            // ================================================================
            // GERAR RESPOSTA DO BOT
            // ================================================================

            const respostaFinal =
              await gerarResposta(
                textoRecebido,
                remetente
              );


            // ================================================================
            // ATENDIMENTO HUMANO ASSUMIU A CONVERSA
            // ================================================================

            if (respostaFinal === null) {

              console.log(
                `🙋 [Painel] Conversa com ` +
                `${nomeContato || remetente} ` +
                `está com atendente humano — bot não respondeu.`
              );

              continue;
            }


            // ================================================================
            // ENVIAR RESPOSTA
            // ================================================================

            await sock.sendMessage(
              remetente,
              {
                text: respostaFinal,
              }
            );


            // ================================================================
            // REGISTRAR RESPOSTA DO BOT
            // ================================================================

            registrarMensagemBot(
              remetente,
              respostaFinal
            );


            console.log(
              `📤 [WhatsApp] Respondido: ` +
              `${String(respostaFinal).substring(0, 60)}...`
            );

          } catch (erroMensagem) {

            console.error(
              '❌ Erro ao processar mensagem individual:',
              erroMensagem
            );
          }
        }
      }
    );

  } catch (erro) {

    console.error(
      '❌ Erro ao iniciar o bot:',
      erro
    );

    sockAtual = null;

    agendarReconexao(
      'erro ao iniciar'
    );
  }
}


// ============================================================================
// PROTEÇÃO CONTRA ERROS GLOBAIS
// ============================================================================
//
// IMPORTANTE:
// Não encerramos nem iniciamos várias reconexões aqui. Um erro interno do
// Baileys pode aparecer como unhandledRejection e não necessariamente
// significa que a sessão morreu.
// ============================================================================

process.on(
  'unhandledRejection',
  (erro) => {

    console.error(
      '⚠️ Promise rejeitada sem tratamento:',
      erro?.message || erro
    );
  }
);


process.on(
  'uncaughtException',
  (erro) => {

    console.error(
      '⚠️ Exceção não tratada:',
      erro?.message || erro
    );
  }
);


// ============================================================================
// INICIALIZAÇÃO DO SISTEMA
// ============================================================================

async function iniciarSistema() {

  console.log('');
  console.log('==========================================');
  console.log('       🤖 BOT DE ATENDIMENTO');
  console.log('==========================================');
  console.log('');


  // ========================================================================
  // WHATSAPP
  // ========================================================================

  iniciarBot();


  // ========================================================================
  // INSTAGRAM (roda em paralelo com o WhatsApp, no mesmo processo)
  // ========================================================================

  iniciarInstagram(processarMensagemInstagram);


  // ========================================================================
  // PAINEL
  // ========================================================================

  try {

    iniciarPainel(
      PORTA_PAINEL,
      obterSockAtual,
      {
        instagramConfigurado:
          instagramConfigurado(),

        processarMensagemInstagram,
      }
    );

    console.log(
      `🌐 Painel iniciado na porta ${PORTA_PAINEL}.`
    );

  } catch (erro) {

    console.error(
      '❌ Erro ao iniciar painel:',
      erro
    );
  }


  console.log('');
  console.log('🚀 Sistema iniciado!');
  console.log('');
}


// ============================================================================
// EXECUTAR
// ============================================================================

iniciarSistema().catch((erro) => {

  console.error(
    '❌ Erro fatal ao iniciar o sistema:',
    erro
  );

})