/**
 * Lista os atendentes cadastrados (login e nome, sem mostrar senha/hash).
 *
 * Uso:
 *   node listar-usuarios.js
 */

const { listarUsuarios } = require('./painel-usuarios');

const usuarios = listarUsuarios();

if (!usuarios.length) {
  console.log('Nenhum atendente cadastrado ainda. Crie um com:');
  console.log('  node criar-usuario.js <login> <senha> "<Nome>"');
} else {
  console.log(`${usuarios.length} atendente(s) cadastrado(s):\n`);
  usuarios.forEach((u) => {
    const data = u.criadoEm ? new Date(u.criadoEm).toLocaleString('pt-BR') : '';
    console.log(`- ${u.usuario}  (${u.nome})${data ? '  · criado em ' + data : ''}`);
  });
}
