# 🤖 Robô de Atendimento — Documentação Completa

> © 2026 **deyvison6599_** — All rights reserved. / Todos os direitos reservados.

## 🇬🇧 English

A simple automated store bot featuring various functions, security measures, and more.

If you need a bot and a dedicated website, please contact me via **Discord** (`deyvison6599_`) or **email** ([deyvisonwilliam826@gmail.com](mailto:deyvisonwilliam826@gmail.com)) so we can prepare a quote based on your specific needs.

> The full documentation below is written in Portuguese.

## 🇧🇷 Português

Um bot de loja automatizado e simples, com diversas funções, medidas de segurança e muito mais.

Se você precisa de um bot e de um site dedicado, entre em contato comigo pelo **Discord** (`deyvison6599_`) ou por **e-mail** ([deyvisonwilliam826@gmail.com](mailto:deyvisonwilliam826@gmail.com)) para prepararmos um orçamento de acordo com as suas necessidades.

---

Bot de atendimento automático para **WhatsApp** (e Instagram Direct, opcional) com **painel web** para atendimento humano. Tudo roda em **um único processo Node.js** (`npm start` → `node index.js`).

> Versão analisada: v6.0.0

---

## 📑 Índice

1. [Visão geral](#1-visão-geral)
2. [Estrutura de arquivos](#2-estrutura-de-arquivos)
3. [Todas as funções](#3-todas-as-funções)
4. [Instalação](#4-instalação)
5. [Configuração](#5-configuração)
6. [Gerenciando atendentes](#6-gerenciando-atendentes)
7. [Usando o painel](#7-usando-o-painel)
8. [Segurança](#8-segurança)
9. [⚠️ Problemas encontrados no projeto](#9-️-problemas-encontrados-no-projeto)
10. [Solução de problemas](#10-solução-de-problemas)

---

## 1. Visão geral

```
Cliente (WhatsApp / Instagram)
        │
        ▼
   index.js ──► bot.js  (decide a resposta)
        │           │
        │           ├─ FAQ por palavras-chave
        │           ├─ Cálculo de frete (planilha Google / fretes.json)
        │           ├─ Pedido finalizado no site (Pix / cartão)
        │           └─ Pedido de atendimento humano
        │
        ├──► painel-cliente.js  (histórico + pausa de conversas)
        ├──► email-notificacao.js (avisa a equipe por e-mail)
        └──► painel-server.js  (API + painel web em /public)
```

**Fluxo resumido de uma mensagem:**

1. Chega mensagem do cliente (grupos são ignorados).
2. Se for comando administrativo (`/criarusuario` etc.), trata e para.
3. Registra no painel.
4. Se pediu humano → envia e-mail para a equipe e **pausa o bot** para aquele cliente.
5. Se a conversa está pausada → bot **não responde**.
6. Caso contrário o bot responde (saudação → pedido finalizado → frete → FAQ → mensagem padrão).

---

## 2. Estrutura de arquivos

| Arquivo | Função |
|---|---|
| `index.js` | Ponto de entrada. Conecta ao WhatsApp, recebe mensagens, comandos admin, reconexão, sobe painel e Instagram |
| `bot.js` | "Cérebro": FAQ, frete, saudação, pedidos, detecção de atendimento humano |
| `painel-server.js` | Servidor Express: API REST do painel, login, arquivos estáticos, túnel opcional |
| `painel-cliente.js` | Estado das conversas (pausa, nomes, histórico) salvo em `painel-estado.json` |
| `painel-usuarios.js` | Cadastro de atendentes, hash de senha, sessões |
| `email-notificacao.js` | Envio de e-mail (Gmail/nodemailer) quando cliente pede humano |
| `instagram.js` | Integração com Instagram Direct (opcional) |
| `criar-usuario.js` / `listar-usuarios.js` / `remover-usuario.js` | Scripts de terminal para gerenciar atendentes |
| `fretes.json` | Tabela de frete local (fallback da planilha) |
| `usuarios.json` | Atendentes cadastrados (com hash scrypt) |
| `painel-estado.json` | Conversas e histórico (gerado automaticamente) |
| `public/painel.html` | Interface do painel |
| `public/manifest.json`, `sw.js`, `icon-*.png` | Fazem o painel instalável como app (PWA) |
| `.env` | Variáveis de ambiente (segredos) |
| `auth_info/` | Sessão do WhatsApp (criada após ler o QR Code) |
| `auth_info_instagram/` | Sessão do Instagram (se ativado) |

---

## 3. Todas as funções

### 3.1 Atendimento automático (`bot.js`)

| Função | O que faz |
|---|---|
| **Saudação** | Reconhece "oi", "bom dia", "boa tarde", "eae" etc. (mensagens de até 4 palavras) e responde com boas-vindas + instrução de como chamar humano |
| **FAQ automático** | 9 grupos de respostas por palavra-chave: pagamento, marcas/estoque, encomendas, presentes/entrega no dia, tom de base/corretivo, originalidade, retirada na loja, link do site/app, horário |
| **Cálculo de frete** | Entende **CEP** (`49480-000` ou `49480000`) ou **nome da cidade**; busca por faixa de CEP, nome exato, nome contido na frase e, por último, similaridade (limiar 0,55) |
| **Frete grátis / expresso** | Mostra "GRÁTIS" quando valor é 0; mostra frete expresso e "grátis acima de R$ X" quando cadastrados |
| **Pedido finalizado do site** | Reconhece a mensagem automática do `carrinho.html` ("gostaria de confirmar meu pedido") e lê a forma de pagamento |
| **Pagamento Pix** | Envia chave Pix + favorecido, pede comprovante e **pausa o bot** para o atendente conferir |
| **Pagamento cartão** | Informa que o pagamento é na entrega; bot continua ativo |
| **Atendimento humano** | Detecta 22 frases ("quero atendimento humano", "falar com atendente"…), incluindo erros de digitação (similaridade ≥ 0,8). Responde, **pausa o bot** e dispara e-mail |
| **Resposta padrão** | Se não entender: avisa que vão chamar alguém. Se parecer pergunta de frete sem cidade cadastrada: pede cidade/CEP |
| **Cache de fretes** | Busca a planilha Google e guarda por 10 minutos; se falhar, usa `fretes.json` |
| **Atualização do fallback** | Cada leitura bem-sucedida da planilha regrava `fretes.json` |

**Ordem de prioridade das respostas:**
`pausado (silêncio)` → `humano` → `pedido finalizado` → `saudação` → `frete` → `FAQ` → `pergunta de frete sem cidade` → `mensagem padrão`

### 3.2 Núcleo e WhatsApp (`index.js`)

| Função | O que faz |
|---|---|
| Conexão WhatsApp | Usa **Baileys** (`@whiskeysockets/baileys`); mostra QR Code no terminal/logs |
| Sessão persistente | Salva credenciais em `auth_info/` |
| Reconexão automática | Espera crescente (5s, 10s… até 60s); evita reconexões duplicadas |
| Detecção de logout | Se o WhatsApp deslogar, avisa para apagar `auth_info/` e reiniciar |
| Filtros | Ignora grupos, mensagens do próprio bot e mensagens sem texto |
| Texto aceito | Mensagem comum, resposta, legenda de foto/vídeo |
| Comandos admin | `/criarusuario`, `/listarusuarios`, `/removerusuario` |
| Notificação por e-mail | Quando cliente pede atendimento humano (WhatsApp ou Instagram) |
| Proteção global | `unhandledRejection` e `uncaughtException` são logados sem derrubar o processo |
| Porta | Usa `process.env.PORT` (padrão `24629`) |

### 3.3 Painel de atendimento (`painel-server.js` + `public/painel.html`)

| Função | Detalhe |
|---|---|
| Login por atendente | Usuário e senha individuais |
| Abas por canal | 💬 WhatsApp e 📸 Instagram, com contador |
| Lista de conversas | Atualiza sozinha a cada 4 segundos |
| Ver histórico | Últimas 50 mensagens por conversa (cliente, bot, atendente) |
| **Assumir atendimento** | Pausa o bot na conversa |
| **Devolver ao bot** | Reativa respostas automáticas |
| **Responder pelo painel** | Envia de verdade pelo WhatsApp/Instagram do bot e identifica o atendente pelo nome |
| Renomear contato | Troca número por nome legível |
| Auto-devolução | Conversa pausada volta ao bot após **60 min** sem atividade |
| Instalável (PWA) | "Adicionar à tela inicial" no Android |
| Logout | Encerra a sessão |

**Endpoints da API** (todos exigem sessão, exceto `/health` e `/api/login`):

| Método | Rota | Função |
|---|---|---|
| GET | `/health` | Verificação de saúde (público) |
| POST | `/api/login` | Login → devolve token de sessão |
| POST | `/api/logout` | Encerra sessão |
| GET | `/api/eu` | Dados de quem está logado |
| GET | `/api/conversas?canal=` | Lista conversas |
| GET | `/api/conversas/:jid` | Conversa completa |
| POST | `/api/conversas/:jid/assumir` | Pausa o bot |
| POST | `/api/conversas/:jid/devolver` | Reativa o bot |
| POST | `/api/conversas/:jid/renomear` | Renomeia contato |
| POST | `/api/conversas/:jid/mensagem-atendente` | Envia mensagem (e pausa o bot) |

### 3.4 Gerenciamento de atendentes (`painel-usuarios.js`)

- Criar, listar e remover atendentes.
- Hash de senha com **scrypt** + salt aleatório de 16 bytes.
- Comparação em tempo constante (`timingSafeEqual`).
- Sessões em memória, token aleatório de 32 bytes, validade de **30 dias**.

### 3.5 E-mail (`email-notificacao.js`)

Envia e-mail via Gmail para um ou mais destinatários com: nome do cliente, número, mensagem e link do painel.

### 3.6 Instagram Direct (`instagram.js`) — opcional

- Faz login com usuário/senha e salva sessão em `auth_info_instagram/`.
- Verifica o Direct em intervalo (padrão 30 s) e passa as mensagens ao mesmo "cérebro" do WhatsApp.
- Envia respostas do bot e do atendente.
- Fica **desativado** se faltar usuário/senha ou a biblioteca (veja o [item 9](#9-️-problemas-encontrados-no-projeto)).

---

## 4. Instalação

### Requisitos

- **Node.js 18 ou superior** (o código usa `fetch` nativo)
- Um número de WhatsApp dedicado ao negócio, com o aparelho por perto para ler o QR Code
- (Opcional) Conta Gmail com senha de app, para os e-mails
- (Opcional) Conta de Instagram dedicada ao bot

### 4.1 Instalação local (teste)

```bash
# 1. Entre na pasta do projeto
cd bot

# 2. Instale as dependências
npm install

# 3. Crie o arquivo .env (veja a seção 5)

# 4. Inicie
npm start
```

Ao iniciar, um **QR Code** aparece no terminal. No celular: **WhatsApp → Aparelhos conectados → Conectar um aparelho** e escaneie.

Mensagens esperadas nos logs:

```
✅ Bot conectado ao WhatsApp com sucesso!
🖥️  Painel interno do Express rodando na porta 24629
🚀 Sistema iniciado!
```

Painel local: `http://localhost:24629`

### 4.2 Instalação na HidenCloud (ou host similar)

1. Crie um serviço **Node.js**.
2. Envie todos os arquivos do projeto (upload, FTP ou Git).
3. Defina o comando de start: `npm start` (ou `node index.js`).
4. Configure as variáveis de ambiente (seção 5).
5. Inicie e leia o QR Code nos **logs** do serviço.
6. Acesse o painel pelo domínio público que o host fornece.

> ⚠️ **Sessão do WhatsApp:** em hosts com disco temporário, a pasta `auth_info/` pode ser apagada a cada reinício e você terá que ler o QR Code de novo. Pergunte ao suporte sobre **armazenamento persistente**.

### 4.3 Manter rodando (VPS própria)

```bash
npm install -g pm2
pm2 start index.js --name robo-atendimento
pm2 save
pm2 startup
```

---

## 5. Configuração

### 5.1 Arquivo `.env` (raiz do projeto)

```env
# OBRIGATÓRIO para usar comandos admin pelo WhatsApp
SENHA_MESTRA_ADMIN=troque-por-uma-senha-longa-e-dificil

# Opcional: senha extra na frente de toda a API
# PAINEL_TOKEN=outra-senha-forte

# E-mail de notificação (recomendado, em vez de deixar no código)
# EMAIL_REMETENTE=seu-gmail@gmail.com
# EMAIL_SENHA_APP=senha-de-app-de-16-letras
# EMAIL_DESTINO=pessoa1@gmail.com, pessoa2@gmail.com

# Instagram (opcional)
# INSTAGRAM_USUARIO=conta-dedicada-ao-bot
# INSTAGRAM_SENHA=senha-da-conta
# INSTAGRAM_INTERVALO_MS=30000
```

### 5.2 Todas as variáveis de ambiente

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `SENHA_MESTRA_ADMIN` | Para comandos admin | Senha dos comandos `/criarusuario`, `/listarusuarios`, `/removerusuario`. Sem ela, os comandos ficam desativados |
| `PORT` | Não | Porta do painel (o host costuma definir sozinho). Padrão `24629` |
| `PAINEL_TOKEN` | Não | Camada extra de senha para a API |
| `EMAIL_REMETENTE` | Recomendado | Gmail que envia as notificações |
| `EMAIL_SENHA_APP` | Recomendado | Senha de app do Gmail (não é a senha da conta) |
| `EMAIL_DESTINO` | Recomendado | Quem recebe os avisos (vários separados por vírgula) |
| `INSTAGRAM_USUARIO` | Não | Ativa o Instagram junto com a senha |
| `INSTAGRAM_SENHA` | Não | Senha da conta do Instagram |
| `INSTAGRAM_INTERVALO_MS` | Não | Intervalo de checagem do Direct (padrão 30000) |
| `USAR_LOCALTUNNEL` | Não | `true` liga o túnel localtunnel (só para testes locais) |

A senha mestra também aceita ser passada como argumento: `node index.js minhaSenha`.
Ordem de prioridade: variável de ambiente → `.env` → argumento.

### 5.3 Dados do negócio que você precisa ajustar no código

| Onde | O que ajustar |
|---|---|
| `bot.js` → `PIX_CHAVE` | **Chave Pix real** (hoje está com texto de exemplo) |
| `bot.js` → `PIX_NOME_FAVORECIDO` | Nome do favorecido |
| `bot.js` → `LINK_SITE_STATUS` | Link do site para acompanhar o pedido |
| `bot.js` → `FAQ` | Respostas e palavras-chave |
| `bot.js` → `FRASES_ATENDIMENTO_HUMANO` | Frases que chamam humano |
| `bot.js` → `FRETES_WEBAPP_URL` | URL do Apps Script da planilha de fretes |
| `painel-cliente.js` → `AUTO_DEVOLVER_MINUTOS` | Tempo de auto-devolução (padrão 60) |
| `email-notificacao.js` | Link do painel no texto do e-mail |

### 5.4 Planilha de fretes (Google Sheets)

A aba **Fretes** precisa ter exatamente estes cabeçalhos na linha 1:

```
CEP Inicial | CEP Final | Descrição | Frete Padrão | Frete Expresso | Grátis Acima De
```

Publique como **Web App** (Apps Script) e coloque a URL em `FRETES_WEBAPP_URL`. Sem planilha, o bot usa `fretes.json` (formato abaixo):

```json
{
  "cepInicio": "49400000",
  "cepFim": "49479999",
  "descricao": "Lagarto",
  "valorPadrao": 15.00,
  "valorExpresso": 0,
  "gratisAcimaDe": 0
}
```

Hoje o `fretes.json` tem **4 faixas** cadastradas.

---

## 6. Gerenciando atendentes

Só quem controla o servidor cria contas — **não existe cadastro pelo painel** (proposital).

### Pelo WhatsApp

Do **seu** WhatsApp, mande mensagem para o número do bot:

```
/criarusuario SENHA_MESTRA login senha Nome Completo
/listarusuarios SENHA_MESTRA
/removerusuario SENHA_MESTRA login
```

### Pelo terminal

```bash
node criar-usuario.js joana "senhaForte123" "Joana Silva"
node listar-usuarios.js
node remover-usuario.js joana
```

> Regras: senha com no mínimo 4 caracteres (recomendado 12+) e login único (sem diferenciar maiúsculas).

---

## 7. Usando o painel

1. Abra `https://SEU-DOMINIO/` (a raiz já abre o painel).
2. Entre com seu login e senha.
3. Escolha a aba **WhatsApp** ou **Instagram**.
4. Toque numa conversa para ver o histórico.
5. **🙋 Assumir atendimento** → o bot para de responder.
6. Digite e envie: a mensagem vai pelo número do bot, com o seu nome registrado.
7. **✅ Devolver pro bot** quando terminar.

**Como app no Android:** abra o link no Chrome → menu ⋮ → **Adicionar à tela inicial**.

**Quando o cliente pede humano:** a equipe recebe e-mail, o bot pausa naquela conversa e você responde pelo painel.

---

## 8. Segurança

### 8.1 O que já está bem feito ✅

- Senhas de atendentes guardadas com **scrypt + salt** (nunca em texto puro).
- Comparação de senha em **tempo constante**.
- Tokens de sessão **aleatórios** (32 bytes) e mantidos só em memória (reiniciar o serviço desloga todos).
- Sessão com **validade** (30 dias).
- **Sem cadastro público** de atendentes.
- Toda a API (exceto `/health` e login) exige sessão.
- Comandos admin exigem senha mestra e ficam desativados se ela não existir.
- Grupos e mensagens do próprio bot são ignorados.
- Mensagens de comando admin **não** são salvas no histórico do painel.
- Express serve apenas a pasta `public/`.

### 8.2 Checklist de segurança antes de colocar no ar

- [ ] `SENHA_MESTRA_ADMIN` longa e única (16+ caracteres)
- [ ] `PAINEL_TOKEN` definido (camada extra)
- [ ] Senhas de atendentes fortes (12+ caracteres)
- [ ] Credenciais de e-mail **fora do código**, em variáveis de ambiente
- [ ] `.env`, `auth_info/`, `usuarios.json`, `painel-estado.json` **fora do Git** (`.gitignore`)
- [ ] Painel acessado somente por **HTTPS**
- [ ] Conta de Instagram **dedicada** (nunca a pessoal)
- [ ] Backup da pasta `auth_info/`
- [ ] Remover atendentes que saíram da equipe
- [ ] Nunca mandar a senha mestra em chat com terceiros

### 8.3 Arquivos sensíveis

| Arquivo/pasta | Risco se vazar |
|---|---|
| `.env` | Controle administrativo do bot |
| `auth_info/` | **Quem tiver essa pasta controla seu WhatsApp** |
| `auth_info_instagram/` | Acesso à conta do Instagram |
| `usuarios.json` | Hashes das senhas dos atendentes |
| `painel-estado.json` | **Dados pessoais de clientes** (nomes, telefones, conversas), ou seja, sujeito à LGPD |
| `email-notificacao.js` | Hoje contém credencial (veja abaixo) |

---

## 9. ⚠️ Problemas encontrados no projeto

Estes pontos saíram da leitura do código. Estão em ordem de gravidade.

### 🔴 Críticos

**1. Senha de app do Gmail escrita no código** (`email-notificacao.js`).
A senha de app e os e-mails estão como valor padrão no arquivo. Como o arquivo foi compartilhado, trate a senha como comprometida:
1. Acesse [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) e **revogue** a senha atual.
2. Gere uma nova.
3. Troque os valores padrão do código por string vazia e use apenas `EMAIL_REMETENTE`, `EMAIL_SENHA_APP` e `EMAIL_DESTINO` pelo `.env`.

**2. Chave Pix não configurada** (`bot.js`).
`PIX_CHAVE` e `PIX_NOME_FAVORECIDO` ainda têm o texto de exemplo. Qualquer pedido pago com Pix fará o bot enviar **"COLE_AQUI_A_CHAVE_PIX"** ao cliente.

**3. Senha mestra exposta em logs e resposta.**
- A mensagem recebida é impressa no log **antes** de ser identificada como comando, então `/criarusuario SENHA_MESTRA ...` aparece nos logs com a senha mestra.
- A resposta do `/criarusuario` devolve a **senha do atendente em texto** no chat.
- Recomendação: não registrar mensagens que começam com `/`, e não ecoar a senha na resposta.

### 🟠 Altos

**4. Qualquer pessoa pode tentar adivinhar a senha mestra.**
Os comandos admin valem para **qualquer número** que escrever ao bot, sem limite de tentativas. Recomendação: aceitar comandos só de números autorizados (lista no `.env`) e usar `timingSafeEqual` na comparação.

**5. Login do painel sem limite de tentativas.**
`/api/login` não bloqueia tentativas repetidas (força bruta). Recomendação: `express-rate-limit` ou bloqueio temporário após N falhas.

**6. CORS aberto para qualquer origem** (`Access-Control-Allow-Origin: *`).
Recomendação: restringir ao domínio do painel.

**7. Senha mínima de apenas 4 caracteres.**
Recomendação: mínimo de 10 a 12.

### 🟡 Médios

**8. Instagram: documentação e código não batem.**
- O `LEIA-ME-PAINEL.md` diz que usa **Puppeteer** e cita `INSTAGRAM_HEADLESS`.
- O código real usa **`instagram-web-api`**, que **não está no `package.json`**, e não lê `INSTAGRAM_HEADLESS`.
- Resultado: após `npm install`, o Instagram fica **desativado em silêncio**.
- Para ativar: `npm install instagram-web-api`.
- Ambas as abordagens são **não oficiais** e a Meta pode bloquear a conta. Use conta dedicada.

**9. Token de sessão no `localStorage`** do navegador. É comum, mas se alguém injetar script na página, pode roubar o token. Evite carregar scripts de terceiros no painel.

**10. Sessões duram 30 dias** sem renovação ou revogação individual. Considere reduzir para alguns dias.

**11. Comentários do `.env` desatualizados.** Citam `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_VERIFY_TOKEN` e `INSTAGRAM_APP_SECRET` (da antiga API oficial da Meta), que o código atual **não usa**.

### 🟢 Baixos

**12.** O texto do e-mail diz "no WhatsApp" mesmo quando o pedido vem do Instagram.
**13.** O link do painel no e-mail e o subdomínio do localtunnel estão fixos no código.
**14.** `README` cita `.env.example` e `.gitignore`, mas **nenhum dos dois está no pacote**. Confira se o `.gitignore` existe de verdade no seu repositório.
**15.** O `localtunnel` fica desligado por padrão (correto). Se ligar com `USAR_LOCALTUNNEL=true`, o painel fica acessível por um endereço público previsível, então use apenas para testes e com `PAINEL_TOKEN`.
**16.** A URL do Apps Script de fretes está no código. Quem a tiver lê sua tabela de fretes (baixo risco, mas não publique o código).

---

## 10. Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| QR Code não aparece | Logs cortados / já logado | Veja os logs completos; se necessário apague `auth_info/` |
| "Sessão desconectada pelo WhatsApp" | Logout pelo celular | Apague `auth_info/` e reinicie para novo QR |
| Pede QR a cada reinício | Disco do host é temporário | Ative armazenamento persistente |
| Comando `/criarusuario` não responde | Sem `SENHA_MESTRA_ADMIN` | Configure no `.env` e reinicie |
| "Senha mestra incorreta" | Senha errada ou com espaço | Use senha sem espaços |
| Não consigo entrar no painel | Usuário não existe | `node listar-usuarios.js` e crie um |
| "Sessão inválida ou expirada" | Serviço reiniciou | Faça login de novo (comportamento esperado) |
| Bot não responde um cliente | Conversa pausada | Abra a conversa e toque em **Devolver pro bot** (ou aguarde 60 min) |
| Bot não acha a cidade | Planilha com cabeçalhos errados | Corrija a linha 1 (seção 5.4) ou ajuste `fretes.json` |
| E-mail não chega | Senha de app inválida/revogada | Gere nova senha de app e configure no `.env` |
| Instagram não conecta | Biblioteca não instalada / checkpoint | `npm install instagram-web-api`, confirme credenciais e verifique login manual na conta |
| Painel "Bad Gateway" | Túnel instável | Deixe `USAR_LOCALTUNNEL` desligado e use o domínio do host |

---

## 📩 Contato / Contact

**🇬🇧 English:** Need a bot and a dedicated website? Contact me via Discord (`deyvison6599_`) or email ([deyvisonwilliam826@gmail.com](mailto:deyvisonwilliam826@gmail.com)) and we will prepare a quote based on your specific needs.

**🇧🇷 Português:** Precisa de um bot e de um site dedicado? Fale comigo pelo Discord (`deyvison6599_`) ou por e-mail ([deyvisonwilliam826@gmail.com](mailto:deyvisonwilliam826@gmail.com)) e preparamos um orçamento de acordo com as suas necessidades.

---

## ©️ Direitos autorais / Copyright

**🇬🇧 English:** © 2026 deyvison6599_. All rights reserved. This software and its documentation may not be copied, redistributed, resold, sublicensed or modified, in whole or in part, without prior written permission from the author.

**🇧🇷 Português:** © 2026 deyvison6599_. Todos os direitos reservados. Este software e sua documentação não podem ser copiados, redistribuídos, revendidos, sublicenciados ou modificados, no todo ou em parte, sem autorização prévia e por escrito do autor.

---

*Documento gerado a partir da leitura do código-fonte do pacote enviado.*