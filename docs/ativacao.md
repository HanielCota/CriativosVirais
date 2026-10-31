# Ativação dos serviços e deploy

Credenciais de IA ficam no runtime do servidor. UTMify e webhook pertencem a cada operação e são conectados na tela Integrações.

## Preparar um ambiente novo

```sh
npm ci
npm run setup:env
npm run doctor
```

`setup:env` cria `.env` com permissão 600, senha Postgres correspondente à URL, segredos de autenticação/criptografia e credenciais RustFS aleatórios. Ele não altera um arquivo existente e não imprime segredos. As chaves e IDs dos provedores ficam vazios. Para criar um arquivo separado, use `npm run setup:env -- --file /caminho/ambiente.env`; o diretório deve existir.

No ambiente já configurado, preserve os segredos e execute apenas o diagnóstico. Não gere novamente a ENCRYPTION_KEY de uma instalação existente: credenciais de integrações já criptografadas dependem dela.

```sh
docker compose up -d --wait postgres rustfs
npm run db:migrate
npm run storage:init
npm run doctor -- --connections
```

Sem `--connections`, o diagnóstico verifica formatos e arquivos sem acessar provedores, banco ou S3. Com essa opção, ele consulta o banco, confere as migrations e consulta bucket/CORS; não grava dados, não aplica migrations, não cria bucket nem envia chamadas pagas de IA. Valores de segredos e detalhes brutos de erros não são exibidos. Saída 1 indica requisito obrigatório pendente; avisos de provedores opcionais não impedem o restante da aplicação. Para exigir todas as chaves/modelos de IA, adicione `--strict-providers`.

O diagnóstico verifica ffmpeg/ffprobe no ambiente em que é executado. Se o worker roda em Docker, verifique dentro dele; o executável no host não é obrigatório nesse caso.

## Executar tudo com Docker

```sh
docker compose build app
docker compose up -d --wait postgres rustfs
docker compose run --rm --no-deps app node dist/tools/src/db/migrate.js
docker compose run --rm --no-deps app node dist/tools/scripts/init-storage.js
docker compose --profile full up -d worker app
docker compose logs -f app worker
```

A mesma imagem executa `node server.js` no app e `node dist/worker.js` no worker. Ela inclui ffmpeg, migrations e o documento mestre, roda sem privilégios e não precisa de segredos nem banco no build. Os volumes persistem ao parar ou recriar serviços; faça backup antes de removê-los.

## Conectar depois

| Serviço | Onde configurar | O que será habilitado | Verificação final |
| --- | --- | --- | --- |
| DeepSeek | DEEPSEEK_API_KEY, DEEPSEEK_MODEL_TEXT e DEEPSEEK_MODEL_VISION no runtime do app e worker | Chat, geração/revisão e descrição dos frames | Criar uma leva pequena; enviar vídeo após conectar Groq |
| Groq | GROQ_API_KEY e GROQ_WHISPER_MODEL no runtime do app e worker | Transcrição de áudio e etapa de áudio do vídeo | Gravar uma mensagem e enviar um vídeo curto com áudio |
| UTMify | Tela Integrações: chave e ID oficial do dashboard | Resumo consolidado, sincronização manual e cron | Sincronizar e conferir status da integração |
| Webhook | Gerar token/secret na tela Integrações e configurar no sistema emissor | Eventos de venda/reembolso atribuídos por creative_key/utm_content | Assinar corpo bruto, enviar evento com ID único e conferir resultado após o worker |
| CSV | Tela Integrações: arquivo, mapeamento, período e fórmulas | Ranking por criativo sem depender de uma API externa | Importar e consultar a mesma janela/fonte |

Confirme os IDs atuais nos documentos oficiais de [DeepSeek](https://api-docs.deepseek.com/guides/vision/) e [Groq](https://console.groq.com/docs/speech-to-text). O código recebe os IDs por configuração. Segredos entram só no `.env` ignorado pelo Git ou nos segredos de runtime.

O worker instala o schema do pg-boss e cria as filas ao iniciar. O app só envia jobs, então inicie o worker pelo menos uma vez antes de usar upload, webhook ou sincronização; até lá essas ações respondem com erro temporário. Falhas de configuração e de provedores aparecem no log do processo com o tipo do erro, sem valores de segredos ou conteúdo de clientes.

Depois de editar `.env`, recrie app e worker para carregar os valores novos:

```sh
docker compose --profile full up -d --force-recreate app worker
docker compose exec worker node dist/tools/scripts/doctor.js --connections --strict-providers
```

Para verificar outro arquivo no host, use `npm run doctor -- --file /caminho/ambiente.env`. O diagnóstico usa as variáveis do processo com prioridade sobre o arquivo. Portanto, dentro do container ele verifica os hostnames internos injetados pelo Compose. A presença de chave/modelo não confirma validade, saldo ou acesso: a validação final dos provedores exige chamadas reais.

UTMify fornece resumo do dashboard sem granularidade documentada por creative_key. CSV e webhook continuam sendo as fontes de ranking por criativo; nenhum resumo será repartido artificialmente entre anúncios. Dados ausentes permanecem NULL.

## Preparar produção no Coolify

Use `.env.production.example` como referência dos campos de runtime; ele não contém credenciais utilizáveis. Configure os mesmos valores no app e worker. Banco e S3 interno usam a rede dos serviços; BETTER_AUTH_URL e S3_PUBLIC_ENDPOINT usam os domínios HTTPS acessíveis pelo navegador. Gere segredos novos para uma instalação nova; preserve-os ao atualizar uma instalação existente.

1. Configure Postgres 17 com volume e RustFS com os volumes indicados no Compose. Atribua credenciais próprias e mantenha o banco na rede interna.
2. Faça build do Dockerfile, app com porta interna 3000 e healthcheck `/api/health`. Esse endpoint confirma que o processo responde, sem revelar configuração e sem afirmar que as dependências estão disponíveis.
3. Execute uma vez `node dist/tools/src/db/migrate.js` e `node dist/tools/scripts/init-storage.js`, com o runtime final, antes de aceitar tráfego.
4. Inicie o worker da mesma imagem com `node dist/worker.js`, sem domínio público, antes de liberar tráfego no app. Garanta acesso a Postgres e RustFS, jobs de até 30 minutos e desligamento gracioso de 35 segundos. O proxy do app precisa permitir streaming e respostas longas.
5. Execute `node dist/tools/scripts/doctor.js --production --connections --strict-providers` dentro do worker. Corrija os FAILs antes de ativar todos os fluxos. Se quiser usar somente CSV/webhook inicialmente, omita `--strict-providers`.
6. Faça os testes da tabela acima. No navegador, confirme que o endpoint público S3 permite PUT a partir do domínio final. Confira os logs do worker e acompanhe um asset até `done`; o diagnóstico não verifica heartbeat do worker nem a rede do navegador.
7. Reinicie os serviços e confirme persistência, login e um resultado já salvo. Antes de atualizar, rode um backup na hora (seção "Backup diário e restauração").
8. Configure um monitor externo de disponibilidade (UptimeRobot, Better Stack, Uptime Kuma ou similar) para consultar `https://<domínio>/api/health/system` a cada 5 minutos e avisar por e-mail ou mensagem quando a resposta não for 200. Ela responde 503 com `problems` indicando o que falhou: `database` (Postgres não responde), `worker` (worker sem sinal há mais de 3 minutos) `queue` (job pronto esperando há mais de 10 minutos) ou `backup` (backup configurado sem cópia concluída nas últimas 26 horas). Não use esse endereço como healthcheck do container: o app continua de pé quando o worker cai, e reiniciá-lo não resolve.

## Backup diário e restauração

**Opcional e desligado por padrão.** Enquanto `BACKUP_S3_BUCKET` estiver vazio, nada é agendado e o `/api/health/system` não cobra backup. Instalações cujo servidor já tem backup externo podem deixar assim. Ligue apenas se não houver outra cópia fora do servidor.

Quando ligado, o worker faz uma cópia por dia às 03:00 (horário de São Paulo) para um bucket compatível com S3 **fora deste servidor**, por exemplo Cloudflare R2 ou Backblaze B2. Se o worker estava parado nesse horário, a cópia roda quando ele volta. Cada cópia leva:

- o banco inteiro (`pg_dump`, formato custom) em `database/AAAA-MM-DD.dump.enc`;
- os arquivos novos ou alterados do RustFS em `files/<chave original>`. Arquivo apagado no app vai para `deleted/AAAA-MM-DD/` e é removido depois de 30 dias.

Tudo é cifrado com AES-256-GCM antes de sair do servidor, com `BACKUP_ENCRYPTION_KEY`. Quem tiver acesso ao bucket não lê nada sem essa chave. Ficam guardadas as últimas 7 cópias diárias do banco e as 4 últimas de domingo.

Configurar:

1. Crie o bucket e uma chave de acesso só para ele (leitura, escrita e exclusão de objetos).
2. Gere `BACKUP_ENCRYPTION_KEY` (32 bytes aleatórios em base64, diferente da `ENCRYPTION_KEY`) e preencha as variáveis `BACKUP_*` do `.env.production.example` no worker e no app. O app só lê essas variáveis para o `/api/health/system`.
3. Guarde `ENCRYPTION_KEY` e `BACKUP_ENCRYPTION_KEY` num gerenciador de senhas. Sem a primeira, as credenciais de integração restauradas ficam ilegíveis; sem a segunda, a cópia inteira fica ilegível.
4. Reinicie o worker e rode a primeira cópia na hora: `node dist/tools/scripts/backup-now.js`. Acompanhe no log do worker a linha `[backup] ... database saved`.

Com as variáveis vazias, o worker avisa no log que o backup está desligado. Com `BACKUP_S3_BUCKET` preenchido e outra variável faltando ou inválida, o worker continua com o resto do trabalho, registra `[backup-config]` no log e o `/api/health/system` acusa `backup`.

Restaurar (servidor novo ou desastre):

1. Suba Postgres e RustFS vazios, com a mesma `ENCRYPTION_KEY` e as variáveis `BACKUP_*` da instalação original. **Não** rode as migrations antes: o dump já traz o schema.
2. Execute `node dist/tools/scripts/init-storage.js` para criar o bucket.
3. Execute `node dist/tools/scripts/restore-backup.js --yes` para a cópia mais recente, ou acrescente `--day=AAAA-MM-DD`. O script recusa banco que não esteja vazio, restaura o banco e depois devolve os arquivos ao bucket.
4. Suba app e worker e confira login, uma conversa e um vídeo antigo.

Se a restauração falhar no meio, nada é desfeito: apague o banco, crie-o vazio de novo e repita.

### Pelo Compose pronto para o Coolify

`docker-compose.coolify.yml` monta os passos 1 a 4 num recurso só: Postgres, RustFS, um serviço `migrate` que aplica as migrations e prepara o bucket antes de app e worker subirem, o app e o worker. O Coolify gera as senhas do banco e do RustFS, `BETTER_AUTH_SECRET` e `ENCRYPTION_KEY` no primeiro deploy (variáveis `SERVICE_*`) e as mantém nos seguintes.

1. Crie um recurso **Public Git Repository** com este repositório, **Build Pack** *Docker Compose* e **Docker Compose Location** `/docker-compose.coolify.yml`.
2. Em **Domains**, informe o domínio do serviço `app` com a porta interna (`https://app.exemplo.com.br:3000`) e o do serviço `rustfs` (`https://arquivos.exemplo.com.br:9000`). Os outros serviços ficam sem domínio. Atrás da Cloudflare, o domínio do RustFS fica em "DNS only": o proxy do plano gratuito recusa envios acima de 100 MB.
3. Em **Environment Variables**, preencha só as chaves e modelos da DeepSeek e da Groq quando forem usados, e `RESEND_API_KEY` com `EMAIL_FROM` para a recuperação de senha por e-mail. Não altere as `SERVICE_*`: trocar `SERVICE_REALBASE64_ENCRYPTION` torna as credenciais salvas ilegíveis. O método privado do cliente, quando houver, vai em `PRIVATE_METHOD_BASE64` (o Markdown em base64, que app e worker acrescentam ao documento mestre), só em runtime: desmarque *Available at Buildtime* para ele não entrar na imagem. Ele nunca vai para o repositório, e uma mudança só vale depois de reiniciar app e worker.
4. Faça o deploy e siga a partir do passo 5 acima.

A cada deploy o `migrate` roda de novo antes de app e worker. Para migrations que pedem os processos parados (veja abaixo), pare o recurso antes do deploy.

## Atualizar uma instalação existente

App e worker precisam rodar a mesma versão do schema. Faça backup do banco,
construa a imagem nova, pare os dois processos, aplique as migrations e suba de
novo. Não execute a versão anterior depois de migrar sem restaurar o backup.

```sh
docker compose build app
docker compose stop app worker
docker compose run --rm --no-deps app node dist/tools/src/db/migrate.js
docker compose --profile full up -d --wait app worker
```

`0003_client-context-indexes` só remove índices duplicados de `client_contexts`
e não exige passos extras.

### Instalações anteriores à atribuição por campanha

A migration `0002_campaign-attribution` altera a chave única das métricas.
Processos antigos tentariam gravar com a chave anterior, por isso app e worker
precisam estar parados durante a migração, como no procedimento acima.

O webhook é recalculado usando a campanha e o dia dos eventos originais. Eventos
sem campanha continuam desconhecidos e não entram em filtros de uma campanha
específica. CSVs antigos preservam valores e períodos, mas sua campanha histórica
não pode ser recuperada de metadados mutáveis do criativo: reimporte o mesmo
período com `campaign_key` explícito para habilitar esse filtro. Sem filtro, os
valores preservados continuam disponíveis. Uma reimportação exata substitui o
snapshot de campanha desconhecida; não soma ambos.

Para CSVs novos, uma chave pode ter uma linha por campanha na mesma janela.
Campos opcionais ausentes preservam nome, campanha e conjunto conhecidos. Se a
chave já tem mais de uma campanha conhecida, o CSV exige campanha explícita.
Janelas sobrepostas da mesma campanha ou snapshots sem campanha sobrepostos a
snapshots por campanha são rejeitados para evitar dupla contagem.

`npm run test:attribution` exige `TEST_DATABASE_URL` apontando para um banco de
teste vazio cujo nome termine em `_test`; nunca usa DATABASE_URL como fallback.
O teste aplica o schema anterior, cria dados sintéticos, migra e verifica os
resultados. Use um banco descartável; o script remove as operações sintéticas,
mas mantém o schema migrado. O CI executa esse fluxo em seu PostgreSQL temporário.
