import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SourceScreen } from './SourceScreen'

afterEach(cleanup)

const renderScreen = (onContinue: (s: unknown) => void = () => {}) =>
  render(<SourceScreen onBack={() => {}} onContinue={onContinue} />)

const continueBtn = () => screen.getByRole('button', { name: /continuar/i })

const openGitTab = () =>
  fireEvent.click(screen.getByRole('tab', { name: /repositorio git/i }))

const gitInput = () => screen.getByPlaceholderText('https://github.com/org/repo')

test('continuar está deshabilitado sin fuente', () => {
  const { container } = renderScreen()
  expect(container.querySelector('[style*="radial-gradient"]')).not.toBeInTheDocument()
  expect(continueBtn()).toBeDisabled()
})

test('elegir un proyecto mock habilita continuar y pasa un Source folder', () => {
  const spy = vi.fn()
  renderScreen(spy)
  fireEvent.click(screen.getByRole('radio', { name: /webapp-acme/ }))
  expect(continueBtn()).toBeEnabled()
  fireEvent.click(continueBtn())
  expect(spy).toHaveBeenCalledOnce()
  expect(spy).toHaveBeenCalledWith({
    kind: 'folder',
    label: 'webapp-acme',
    value: 'C:\\proyectos\\webapp-acme',
  })
})

test('rechaza URLs inválidas: vacía, "notaunaurl", con espacios', () => {
  renderScreen()
  openGitTab()
  expect(continueBtn()).toBeDisabled()
  fireEvent.change(gitInput(), { target: { value: 'notaunaurl' } })
  expect(continueBtn()).toBeDisabled()
  fireEvent.change(gitInput(), { target: { value: 'https://github.com/org repo' } })
  expect(continueBtn()).toBeDisabled()
})

test('acepta https://… y git@github.com:user/repo.git (con o sin .git)', () => {
  const spy = vi.fn()
  renderScreen(spy)
  openGitTab()
  const cont = continueBtn()

  fireEvent.change(gitInput(), {
    target: { value: 'https://github.com/org/repo.git' },
  })
  expect(cont).toBeEnabled()
  fireEvent.click(cont)
  expect(spy).toHaveBeenCalledWith({
    kind: 'git',
    label: 'github.com/org/repo',
    value: 'https://github.com/org/repo.git',
  })
  spy.mockClear()

  fireEvent.change(gitInput(), {
    target: { value: 'git@github.com:user/repo.git' },
  })
  expect(cont).toBeEnabled()
  fireEvent.click(cont)
  expect(spy).toHaveBeenCalledWith({
    kind: 'git',
    label: 'github.com/user/repo',
    value: 'git@github.com:user/repo.git',
  })
  spy.mockClear()

  fireEvent.change(gitInput(), { target: { value: 'https://github.com/org/repo' } })
  expect(cont).toBeEnabled()
  fireEvent.click(cont)
  expect(spy).toHaveBeenCalledWith({
    kind: 'git',
    label: 'github.com/org/repo',
    value: 'https://github.com/org/repo',
  })
})
