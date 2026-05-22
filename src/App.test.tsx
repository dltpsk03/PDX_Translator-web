import { render, screen } from '@testing-library/react'

import App from './App'

describe('App', () => {
  it('renders the initial translation dashboard sections', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Paradox MOD YML Translator' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'File Upload' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ollama Connection' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Translation Settings' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Result Download' })).toBeInTheDocument()
  })
})
