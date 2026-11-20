import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HomeScreen } from './HomeScreen'

afterEach(cleanup)

test('renderiza el titular y el CTA', () => {
  const { container } = render(<HomeScreen onAnalyze={() => {}} />)
  expect(container.querySelector('[style*="radial-gradient"]')).not.toBeInTheDocument()
  expect(
    screen.getByText(/Encuentra la brecha antes que el atacante/i),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /analizar aplicación/i }),
  ).toBeInTheDocument()
})

test('pulsar el CTA llama a onAnalyze', () => {
  const spy = vi.fn()
  render(<HomeScreen onAnalyze={spy} />)
  fireEvent.click(screen.getByRole('button', { name: /analizar aplicación/i }))
  expect(spy).toHaveBeenCalledOnce()
})
