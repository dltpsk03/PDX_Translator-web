import { render, screen } from '@testing-library/react'

import App from './App'

describe('App', () => {
  it('renders the initial translation dashboard sections', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Paradox MOD YML Translator' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '파일 업로드' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '번역 엔진' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '번역 설정' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '진행률' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '결과 다운로드' })).toBeInTheDocument()
  })
})
