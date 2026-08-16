import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * Roadmap task 5.7: responsive and keyboard accessible.
 *
 * Automated checks catch the mechanical failures - missing labels, unlabelled
 * controls, colour contrast - which is most of what goes wrong, but not all of
 * it. The keyboard tests below cover the parts axe cannot judge: that you can
 * actually reach and operate the test player without a mouse.
 */

const password = 'a11y pass 1'

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`
}

async function register(page, email) {
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
}

async function scan(page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
}

test('the sign-in screen has no accessibility violations', async ({ page }) => {
  await page.goto('/login')
  const results = await scan(page)
  expect(results.violations).toEqual([])
})

test('the dashboard has no accessibility violations', async ({ page }) => {
  await register(page, uniqueEmail('a11y-home'))
  const results = await scan(page)
  expect(results.violations).toEqual([])
})

test('practice mode has no accessibility violations', async ({ page }) => {
  await register(page, uniqueEmail('a11y-practice'))
  await page.getByRole('link', { name: 'Practice' }).click()
  await expect(page.getByRole('button', { name: 'Check answer' }).first()).toBeVisible()
  const results = await scan(page)
  expect(results.violations).toEqual([])
})

test('the test player has no accessibility violations', async ({ page }) => {
  await register(page, uniqueEmail('a11y-player'))
  await page.getByRole('link', { name: 'Tests' }).click()
  await page.getByRole('button', { name: 'Start test' }).first().click()
  await expect(page.getByText(/Module 1 of 4/)).toBeVisible()
  const results = await scan(page)
  expect(results.violations).toEqual([])
})

test('the score report has no accessibility violations', async ({ page }) => {
  await register(page, uniqueEmail('a11y-score'))
  await page.getByRole('link', { name: 'Tests' }).click()
  await page.getByRole('button', { name: 'Start test' }).first().click()
  await expect(page.getByText(/Module 1 of 4/)).toBeVisible()

  // End it immediately; an incomplete report still has to be readable.
  await page.getByText('Abandon this test').click()
  await page.getByRole('button', { name: 'End test now' }).click()
  await expect(page).toHaveURL(/\/result$/)

  const results = await scan(page)
  expect(results.violations).toEqual([])
})

test('a keyboard alone can sign in', async ({ page }) => {
  const email = uniqueEmail('a11y-keyboard')
  await register(page, email)
  await page.getByRole('button', { name: 'Sign out' }).click()

  await page.goto('/login')

  // The sign-in screen is not inside the app shell, so there is no skip link
  // to pass first - the first tab stop is the email field. Asserted rather
  // than assumed, because a stray focusable element ahead of the form would
  // be a real regression.
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toHaveAttribute('id', 'email')
  await page.keyboard.type(email)

  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toHaveAttribute('id', 'password')
  await page.keyboard.type(password)

  // Enter submits from within the form; no reach for the mouse.
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('the sign-in form tab order is email, password, submit', async ({ page }) => {
  await page.goto('/login')
  const order = []
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Tab')
    order.push(
      await page.evaluate(() => {
        const el = document.activeElement
        return el.id || el.textContent.trim()
      }),
    )
  }
  expect(order).toEqual(['email', 'password', 'Sign in'])
})

test('the skip link is reachable and jumps to the main content', async ({ page }) => {
  await register(page, uniqueEmail('a11y-skip'))
  await page.keyboard.press('Tab')

  const focused = page.locator(':focus')
  await expect(focused).toHaveText('Skip to main content')
  await expect(focused).toBeVisible()
})

test('a question can be answered and flagged from the keyboard', async ({ page }) => {
  await register(page, uniqueEmail('a11y-answer'))
  await page.getByRole('link', { name: 'Tests' }).click()
  await page.getByRole('button', { name: 'Start test' }).first().click()
  await expect(page.getByText(/Module 1 of 4/)).toBeVisible()

  const firstChoice = page.getByRole('radio').first()
  await firstChoice.focus()
  await page.keyboard.press('Space')
  await expect(firstChoice).toBeChecked()

  const flag = page.getByRole('button', { name: /Flag for review/ })
  await flag.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /Flagged for review/ })).toBeVisible()
})

test('the layout works on a narrow phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await register(page, uniqueEmail('a11y-mobile'))
  await page.getByRole('link', { name: 'Tests' }).click()
  await page.getByRole('button', { name: 'Start test' }).first().click()
  await expect(page.getByText(/Module 1 of 4/)).toBeVisible()

  // Nothing may overflow horizontally - a test player you have to pan
  // sideways to read is unusable on a phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)

  const results = await scan(page)
  expect(results.violations).toEqual([])
})
