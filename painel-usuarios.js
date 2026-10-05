/**
 * Autenticação do painel de atendimento.
 *
 * Diferente do antigo PAINEL_TOKEN (uma senha única, compartilhada, colada
 * no HTML), aqui cada atendente tem seu próprio login e senha. Isso permite
 * saber QUEM (qual atendente) mandou cada mensagem pelo painel, não só que
 * "um atendente" respondeu.
 *
 * IMPORTANTE: só quem tem acesso ao terminal/servidor (o dono do bot) cria
 * contas novas, rodando o script `node criar-usuario.js usuario senha "Nome"`.
 * Não existe endpoint de cadastro público — de propósito, por segurança.
 *
 * Senhas nunca são guardadas em texto puro: usamos scrypt (nativo do Node,
 * sem precisar instalar nenhuma dependência nova) com um "salt" aleatório
 * por usuário.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USUARIOS_PATH = path.join(__dirname, 'usuarios.json');

// Sessões ficam em memória (não em disco): se o processo reiniciar, todo
// mundo precisa logar de novo. É proposital — mais simples e mais seguro
// (nenhum token de sessão fica salvo em arquivo).
const SESSOES = new Map(); // token -> { usuario, nome, criadoEm }
const SESSAO_VALIDADE_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias

function carregarUsuarios() {
  try {
    const conteudo = fs.readFileSync(USUARIOS_PATH, 'utf-8');
    const dados = JSON.parse(conteudo);
    return Array.isArray(dados) ? dados : [];
  } catch (erro) {
    return [];
  }
}

function salvarUsuarios(usuarios) {
  fs.writeFileSync(USUARIOS_PATH, JSON.stringify(usuarios, null, 2), 'utf-8');
}

function gerarHash(senha, salt) {
  return crypto.scryptSync(String(senha), salt, 64).toString('hex');
}

/**
 * Cria um novo atendente. Lança erro se o login já existir.
 * Usado só pelo script de linha de comando `criar-usuario.js`.
 */
function criarUsuario(usuario, senha, nome) {
  usuario = String(usuario || '').trim();
  senha = String(senha || '');
  nome = String(nome || '').trim();

  if (!usuario || !senha || !nome) {
    throw new Error('Usuário, senha e nome são obrigatórios.');
  }
  if (senha.length < 4) {
    throw new Error('A senha precisa ter pelo menos 4 caracteres.');
  }

  const usuarios = carregarUsuarios();
  if (usuarios.some((u) => u.usuario.toLowerCase() === usuario.toLowerCase())) {
    throw new Error(`Já existe um usuário com o login "${usuario}".`);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = gerarHash(senha, salt);
  usuarios.push({ usuario, nome, salt, hash, criadoEm: Date.now() });
  salvarUsuarios(usuarios);
}

/** Remove um atendente pelo login. Usado pelo script `remover-usuario.js`. */
function removerUsuario(usuario) {
  const usuarios = carregarUsuarios();
  const restantes = usuarios.filter((u) => u.usuario.toLowerCase() !== String(usuario || '').toLowerCase());
  if (restantes.length === usuarios.length) {
    throw new Error(`Nenhum usuário encontrado com o login "${usuario}".`);
  }
  salvarUsuarios(restantes);
}

function listarUsuarios() {
  return carregarUsuarios().map((u) => ({ usuario: u.usuario, nome: u.nome, criadoEm: u.criadoEm || null }));
}

/**
 * Confere usuário/senha. Retorna { usuario, nome } se válido, ou null.
 * Usa comparação em tempo constante (timingSafeEqual) pra não vazar
 * informação sobre a senha certa através do tempo de resposta.
 */
function verificarLogin(usuario, senha) {
  const usuarios = carregarUsuarios();
  const encontrado = usuarios.find(
    (u) => u.usuario.toLowerCase() === String(usuario || '').toLowerCase()
  );
  if (!encontrado) return null;

  const tentativa = gerarHash(senha, encontrado.salt);
  const bufA = Buffer.from(tentativa, 'hex');
  const bufB = Buffer.from(encontrado.hash, 'hex');
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return null;
  }
  return { usuario: encontrado.usuario, nome: encontrado.nome };
}

function criarSessao(usuario, nome) {
  const token = crypto.randomBytes(32).toString('hex');
  SESSOES.set(token, { usuario, nome, criadoEm: Date.now() });
  return token;
}

function obterSessao(token) {
  if (!token) return null;
  const sessao = SESSOES.get(token);
  if (!sessao) return null;
  if (Date.now() - sessao.criadoEm > SESSAO_VALIDADE_MS) {
    SESSOES.delete(token);
    return null;
  }
  return sessao;
}

function encerrarSessao(token) {
  SESSOES.delete(token);
}

module.exports = {
  criarUsuario,
  removerUsuario,
  listarUsuarios,
  verificarLogin,
  criarSessao,
  obterSessao,
  encerrarSessao,
};
