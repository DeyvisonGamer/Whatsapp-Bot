const nodemailer = require('nodemailer');

// ==== CONFIGURAÇÃO DO E-MAIL (AJUSTE AQUI) ====
// EMAIL_REMETENTE: o Gmail que vai ENVIAR as notificações.
// EMAIL_SENHA_APP: a "Senha de app" do Gmail (NÃO é a senha normal da conta).
//   Como gerar: myaccount.google.com/apppasswords (precisa ter a verificação
//   em 2 etapas ativada na conta Google). Gera uma senha de 16 letras, só
//   pra isso — cole ela aqui.
// EMAIL_DESTINO: pra quem as notificações vão chegar. Se deixar em branco,
//   vai pro próprio EMAIL_REMETENTE.
//
// Pode preencher direto aqui embaixo OU (mais seguro) configurar como
// variável de ambiente no painel do HidenCloud com o mesmo nome.
// EMAIL_DESTINO: pra quem as notificações vão chegar. Aceita mais de um
//   e-mail — é só separar por vírgula (ex: "fulano@gmail.com, ciclano@gmail.com").
//   Se deixar em branco, vai pro próprio EMAIL_REMETENTE.
const EMAIL_REMETENTE = process.env.EMAIL_REMETENTE || '';
const EMAIL_SENHA_APP = process.env.EMAIL_SENHA_APP || '';
const EMAIL_DESTINO = process.env.EMAIL_DESTINO || '';

const transportador = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_REMETENTE,
    pass: EMAIL_SENHA_APP,
  },
});

/**
 * Envia um e-mail avisando que um cliente pediu atendimento humano.
 * Não trava o bot se o e-mail falhar — só loga o erro.
 */
async function enviarEmailAtendimentoHumano(nomeContato, numeroCliente, mensagemCliente) {
  const assunto = `🙋 Atendimento humano solicitado — ${nomeContato || numeroCliente}`;
  const corpo =
    `Um cliente pediu atendimento humano no WhatsApp.\n\n` +
    `Cliente: ${nomeContato || numeroCliente}\n` +
    `Número: ${numeroCliente}\n` +
    `Mensagem: "${mensagemCliente}"\n\n` +
    `O bot já foi pausado pra esse cliente. Entre no painel pra responder:\n` +
    ``;

  try {
    await transportador.sendMail({
      from: `"Bot Whatsapp" <${EMAIL_REMETENTE}>`,
      to: EMAIL_DESTINO,
      subject: assunto,
      text: corpo,
    });
    console.log(`   ✅ E-mail de notificação enviado para ${EMAIL_DESTINO}`);
  } catch (erro) {
    console.error(`   ❌ Erro ao enviar e-mail de notificação:`, erro.message || erro);
  }
}

module.exports = { enviarEmailAtendimentoHumano };
