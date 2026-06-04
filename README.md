# Bolao da Copa 2026

Aplicativo web familiar para palpites da Copa do Mundo 2026.

## Como usar

Abra `bolao_copa2026.html` no navegador.

- Senha inicial do admin: `copa2026`
- Sem backend configurado, os dados ficam salvos no `localStorage` do navegador
- Com Supabase configurado, os dados sincronizam entre os celulares
- No celular, pode ser instalado como aplicativo pela tela inicial

## Backend simples com Supabase

1. Crie um projeto no Supabase
2. Abra o SQL Editor
3. Rode o conteudo de `supabase-setup.sql`
4. Copie a Project URL e a anon/public key
5. Preencha `backend-config.js`
6. Envie a alteracao para o GitHub

O app usa uma unica linha da tabela `bolao_state` para guardar o estado completo do bolao em JSON.

## Hospedagem recomendada: Vercel

Use o GitHub apenas como repositorio e a Vercel para hospedar o app.

1. Acesse `https://vercel.com`
2. Clique em `Add New...` > `Project`
3. Importe o repositorio `Andreviga/bolaodacopa`
4. Em `Project Name`, use `bolaodacopa`
5. Em `Framework Preset`, escolha `Other`
6. Deixe `Build Command` vazio
7. Deixe `Output Directory` vazio
8. Clique em `Deploy`

Se o nome do projeto for `bolaodacopa`, o link final deve ficar:

`https://bolaodacopa.vercel.app/`

O arquivo `vercel.json` ja configura cache baixo para HTML, `sw.js` e `backend-config.js`, evitando que uma versao antiga fique presa no navegador.

## Hospedagem no GitHub Pages

Depois de enviar o repositorio para o GitHub:

1. Abra o repositorio no GitHub
2. Va em `Settings`
3. Va em `Pages`
4. Em `Build and deployment`, escolha `Deploy from a branch`
5. Escolha a branch `main` e a pasta `/root`
6. Acesse a URL gerada pelo GitHub Pages

Com o `index.html`, a URL final ficara parecida com:

`https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`

Para este projeto:

`https://andreviga.github.io/bolaodacopa/`
