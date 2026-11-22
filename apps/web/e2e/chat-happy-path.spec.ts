import { expect, test } from '@playwright/test';

const QUESTION = 'Qual foi a receita líquida da Vale no 3T25?';
const EXPECTED_REVENUE = 'R$ 56,7 bilhões';
const EXPECTED_PERIOD_END = '2025-09-30';
const EXPECTED_ORIGIN = 'Base local (CVM)';
const EXPECTED_CVM_ZIP_URL =
  'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_2025.zip';

test('caminho feliz do chat em modo DEMO: disclaimer permanente, resposta em streaming, detalhe da citação CVM e grafo em 3 etapas sem Search', async ({
  page,
}) => {
  await page.goto('/');

  // 1. Disclaimer regulatório visível antes do envio
  const disclaimer = page.locator('.chat__disclaimer');
  await expect(disclaimer).toBeVisible();
  await expect(disclaimer).toContainText(/exclusivamente informativo/i);

  // 2. Envia a pergunta sobre a receita líquida da Vale no 3T25
  const input = page.locator('textarea.chat__input');
  await input.fill(QUESTION);

  const sendButton = page.locator('button.chat__send');
  await expect(sendButton).toBeEnabled();
  await sendButton.click();

  // Disclaimer permanece visível durante o streaming
  await expect(disclaimer).toBeVisible();

  // 3. Espera a resposta completa em streaming conter 'R$ 56,7 bilhões'
  const assistantBody = page.locator('.chat__message--assistant .chat__body');
  await expect(assistantBody).toContainText(EXPECTED_REVENUE);

  // Aguarda o fim do streaming palavra por palavra (cursor desaparece e citação aparece)
  const citationChip = page.locator('.chat__citation').first();
  await expect(citationChip).toBeVisible();

  // 4. Clica na citação e confirma data-base '2025-09-30', origem 'Base local (CVM)' e o link pro ZIP da CVM
  await citationChip.click();

  const sourcePanel = page.locator('.chat__source-panel');
  await expect(sourcePanel).toBeVisible();
  await expect(sourcePanel.locator('.source-panel__period')).toContainText(EXPECTED_PERIOD_END);
  await expect(sourcePanel.locator('.source-panel__origin')).toHaveText(EXPECTED_ORIGIN);

  const cvmLink = sourcePanel.locator('a.source-panel__link');
  await expect(cvmLink).toHaveAttribute('href', EXPECTED_CVM_ZIP_URL);
  await expect(cvmLink).toContainText('itr_cia_aberta_2025.zip');

  // 5. Confirma que o painel do grafo terminou em 3 etapas concluídas — sem passar por Search
  const graphSteps = page.locator('.graph-panel__step');
  await expect(graphSteps).toHaveCount(3);

  const completedSteps = page.locator('.graph-panel__step--completed');
  await expect(completedSteps).toHaveCount(3);

  const stepLabels = page.locator('.graph-panel__label');
  await expect(stepLabels).toHaveText(['Retrieve', 'Grade', 'Answer']);
  await expect(page.locator('.graph-panel')).not.toContainText(/Search/i);
  await expect(page.locator('.graph-panel__banner')).toHaveCount(0);

  // 6. Disclaimer continua visível após toda a interação
  await expect(disclaimer).toBeVisible();
});
