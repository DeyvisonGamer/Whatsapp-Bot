/**
 * Script pra criar um login de atendente. Só roda por quem tem acesso ao
 * terminal do servidor (ou seja, só o dono/administrador) — não existe
 * cadastro pelo painel web de propósito, por segurança.
 *
 * Uso:
 *   node criar-usuario.js <login> <senha> <Nome de exibição>
 *
 * Exemplo:
 *   node criar-usuario.js joana 12345678 "Joana Silva"
 *
 * Depois disso, "Joana Silva" já pode logar no painel com login "joana" e
 * a senha escolhida, e as mensagens que ela mandar pelo painel vão aparecer
 * marcadas com o nome dela, não só "atendente".
 */

const { criarUsuario } = require('./painel-usuarios');

const [, , usuario, senha, ...restoNome] = process.argv;
const nome = restoNome.join(' ');

if (!usuario || !senha || !nome) {
  console.log('Uso: node criar-usuario.js <login> <senha> <Nome de exibição>');
  console.log('Exemplo: node criar-usuario.js joana 12345678 "Joana Silva"');
  process.exit(1);
}

try {
  criarUsuario(usuario, senha, nome);
  console.log(`✅ Usuário criado! Login: "${usuario}"  Nome: "${nome}"`);
  console.log('Agora essa pessoa já pode entrar no painel com esse login e senha.');
} catch (erro) {
  console.error('❌ ' + erro.message);
  process.exit(1);
}
