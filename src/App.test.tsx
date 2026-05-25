import { fireEvent, render, screen } from '@testing-library/react'

import App from './App'

describe('App', () => {
  it('renders the workflow tabs and switches between primary views', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByRole('heading', { name: 'Paradox MOD YML Translator' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 Prepare/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2 Run \/ Result/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /3 Review/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'File Upload' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Translation Engine' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /2 Run \/ Result/ }))
    expect(screen.getByRole('heading', { name: 'File Upload' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Result Download' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /3 Review/ }))
    expect(screen.getByRole('heading', { name: 'File Progress' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Failure / Quality Report' })).toBeInTheDocument()
  })
})
