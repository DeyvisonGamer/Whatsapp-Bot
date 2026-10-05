/**
 * Remove o login de um atendente.
 *
 * Uso:
 *   node remover-usuario.js <login>
 */

const { removerUsuario } = require('./painel-usuarios');

const [, , usuario] = process.argv;

if (!usuario) {
  console.log('Uso: node remover-usuario.js <login>');
  process.exit(1);
}

try {
  removerUsuario(usuario);
  console.log(`✅ Usuário "${usuario}" removido.`);
} catch (erro) {
  console.error('❌ ' + erro.message);
  process.exit(1);
}
