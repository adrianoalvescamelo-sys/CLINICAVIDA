# Manual do Usuário — App Clínica Vida

Guia operacional para uso diário do sistema na **Clínica Vida Popular — Sinop/MT**.
Destinado a recepção, administração e profissionais de saúde. Não é documentação técnica.

> Dúvidas técnicas ou problemas de acesso: contate o administrador do sistema.

---

## 1. Acesso ao sistema

1. Abra o navegador e acesse o endereço do sistema fornecido pela clínica.
2. Informe **e-mail** e **senha**.
3. Clique em **Entrar**.

O sistema funciona como aplicativo (PWA): no celular ou desktop você pode
"Instalar" pelo menu do navegador para abrir como app, sem digitar o endereço toda vez.

**Esqueci a senha / conta bloqueada:** após várias tentativas erradas a conta é
bloqueada temporariamente. Procure o administrador para desbloquear ou redefinir.

**Trocar a própria senha:** clique no seu nome no canto superior direito →
**Minha conta** → preencha senha atual e nova senha. Após trocar, você é
deslogado de todos os dispositivos e precisa entrar de novo.

---

## 2. Perfis de acesso

O que cada perfil enxerga e pode fazer:

| Perfil | Pode |
|---|---|
| **Administrador** | Tudo: pacientes, agenda, usuários, profissionais, configurações, relatórios, lista de espera, WhatsApp, painéis. |
| **Recepção** | Pacientes, agenda, lista de espera, WhatsApp, relatórios, painel TV. **Sem** prontuário, **sem** gestão de usuários. |
| **Médico** | Própria agenda, todos os dados do paciente, bloqueio da própria agenda, painel de chamada. **Sem** lista de espera. |
| **Profissional (não médico)** | Própria agenda, dados básicos do paciente, bloqueio da própria agenda. **Sem** receita/atestado, **sem** lista de espera. |

Tentar abrir uma tela sem permissão redireciona de volta — é esperado, não é erro.

---

## 3. Pacientes

Menu **Pacientes**.

### Buscar paciente
Use o campo de busca no topo. Funciona por **nome**, **CPF** ou **telefone**.
A lista atualiza enquanto você digita.

### Cadastrar novo paciente
1. Clique em **+ Novo paciente**.
2. Preencha os dados. **CPF é obrigatório e único** — o sistema bloqueia CPF
   já cadastrado.
3. Campos mínimos: nome completo, CPF, data de nascimento, telefone WhatsApp.
4. Salve.

### Editar paciente
Clique em **Editar** na linha do paciente. Admin e recepção podem alterar
qualquer dado cadastral.

> Acesso a cadastro/edição: somente **Administrador** e **Recepção**.

---

## 4. Agenda

Menu **Agenda**. Coração do sistema.

### Visualização
- Alterne entre **Dia** e **Semana** nos botões no topo.
- Use as setas **‹ ›** para navegar e **Hoje** para voltar à data atual.
- Filtre por profissional no seletor "Todos profissionais".
- Cada profissional tem uma cor própria nos cartões.

### Criar agendamento
**Opção A** — botão **+ Novo agendamento** (preenche o formulário completo).

**Opção B** — na grade semanal, **clique num horário vazio** → escolha **Agendar** →
**Continuar**. Abre o formulário já com data/hora/profissional preenchidos.

No formulário: escolha paciente, profissional, tipo (consulta, retorno, exame,
procedimento, outro), data, hora e duração. A duração padrão vem das
configurações da clínica.

### Ver detalhes / mudar status
Clique num agendamento na grade ou na lista. Abre uma janela com as ações
disponíveis conforme o status atual:

| Status atual | Ações possíveis |
|---|---|
| Solicitado / Pré-agendamento | Confirmar, Cancelar, Faltou, Editar |
| Confirmado | Marcar Aguardando, Cancelar, Faltou, Editar |
| Aguardando | **Chamar**, Cancelar, Faltou |
| Em atendimento | **Atendido** |

Fluxo típico: Confirmado → (paciente chega) Aguardando → Chamar → Em atendimento → Atendido.

### Remarcar
- Pela janela de detalhes: botão **Editar** → ajuste data/hora/profissional.
- Pela grade semanal: **arraste o cartão** para outro horário vazio. Confirme.
  A duração é mantida.

> Cancelamento e remarcação automáticos via WhatsApp valem até **2h antes**.
> Depois disso vira pendência manual para a recepção.

### Encaixe
Se o horário escolhido conflita com outro agendamento, o sistema avisa e permite
**encaixe** com confirmação manual. Agendamentos de encaixe têm a marca "encaixe".

---

## 5. Bloqueios de horário

Menu **Bloqueios**. Para marcar períodos indisponíveis (almoço, férias, reunião).

### Criar bloqueio
1. Escolha o profissional.
2. Defina início e fim (ou marque um intervalo direto pela grade da agenda).
3. Motivo é opcional.
4. Salve.

Atalho: na grade semanal, clique num horário vazio → **Bloquear horário** →
preencha (há opção **Dia todo**).

### Remover bloqueio
Na lista de bloqueios, clique em **Remover** e confirme. Na grade, clique no
bloqueio (faixa listrada) → **Remover bloqueio**.

> Acesso: **Administrador** bloqueia qualquer profissional. **Médico** e
> **profissional não médico** bloqueiam apenas a própria agenda.

---

## 6. Lista de espera

Menu **Lista de espera**. Fila priorizada de pacientes aguardando vaga.

### Adicionar paciente
Botão **+ Adicionar paciente** → escolha paciente, profissional/especialidade
(opcional), prioridade e melhores horários.

### Operar a fila
Filtre por status e profissional. Ações por linha:

| Status | Ações |
|---|---|
| Ativo | **Ofertar** (entra em contato), Cancelar |
| Contatado | **Agendou**, **Recusou** (com motivo), Cancelar |

Prioridade maior aparece destacada. Ajuste a prioridade clicando no número.

> Acesso: somente **Administrador** e **Recepção**. Médico/profissional não acessam.

---

## 7. Recepção (painel do dia)

Menu **Recepção**. Tela de operação da recepção com visão consolidada do dia:

- Agenda do dia e contadores (agenda, aguardando, em atendimento, confirmações,
  WhatsApp pendentes, lista de espera).
- Pacientes aguardando chamada.
- Confirmações pendentes.
- Mensagens WhatsApp pendentes.
- Atalhos da lista de espera (ofertar, agendar, recusar, ajustar prioridade).

Botão **Atualizar** recarrega os dados.

---

## 8. Painel TV (chamada de pacientes)

Menu **Painel TV**. Abra numa TV ou monitor na sala de espera.

- Mostra **nome completo** do paciente chamado, em destaque grande.
- Relógio em tempo real.
- Fila dos próximos.
- Histórico dos últimos chamados.
- Pisca ao chamar um novo paciente.

A chamada é disparada pela agenda/recepção ao clicar **Chamar** num paciente
com status Aguardando.

---

## 9. WhatsApp

Menu **WhatsApp**. Acompanhamento das mensagens automáticas.

- **Confirmação 24h antes** do agendamento.
- **Reenvio 2h antes** se não houve resposta.
- Cancelamento, remarcação e aviso de vaga liberada.

A tela lista mensagens **pendentes** que precisam de atenção da recepção
(falhas, respostas tardias, confirmações manuais).

> Acesso: **Administrador** e **Recepção**.

---

## 10. Relatórios

Menu **Relatórios**. Operacionais, sem dados financeiros.

Disponíveis:
- Agenda do dia.
- Agendamentos por status.
- Pacientes cadastrados no período.
- Origem dos agendamentos.

Aplique filtros (data, profissional, status) e **exporte em Excel ou PDF**.

> Acesso: **Administrador** e **Recepção**.

---

## 11. Administração (somente Admin)

### Usuários (logins do sistema)
Menu **Usuários**. Criar, editar e desativar logins; trocar/redefinir senha de
qualquer usuário.

1. **+ Novo usuário**: e-mail, nome, perfil e senha inicial.
2. **Editar**: nome, perfil, ativo/inativo.
3. **Trocar senha**: define nova senha para o usuário (ele deve trocá-la depois).

> Não confunda **Usuário** (login) com **Profissional** (agenda). Um profissional
> pode ou não ter um login vinculado.

### Profissionais
Menu **Profissionais**. Cadastro de quem atende: nome, especialidade, registro
de conselho, se é médico, cor na agenda e vínculo opcional com um login.

### Configurações da clínica
Menu **Configurações**. Define o comportamento da agenda:
- Nome da clínica.
- Horário de abertura e fechamento.
- Duração padrão da consulta.
- Dias de funcionamento.
- Intervalo de almoço (opcional) — marca o horário como indisponível.
- Timezone.

Mudanças aqui afetam horários sugeridos e a grade da agenda para todos.

---

## 12. Dúvidas comuns

**Cliquei numa tela e voltou pra inicial.**
Seu perfil não tem acesso àquela função. Normal.

**Não consigo logar após erros de senha.**
Conta bloqueada por segurança. Aguarde ou peça desbloqueio ao administrador.

**Paciente não recebeu WhatsApp.**
Verifique o número cadastrado e a tela WhatsApp (mensagens pendentes/falhas).

**CPF não aceita ao cadastrar.**
CPF já existe ou está incompleto. Busque o paciente antes de cadastrar de novo.

**Mudei de senha e fui deslogado.**
Esperado — troca de senha encerra todas as sessões. Entre novamente.
