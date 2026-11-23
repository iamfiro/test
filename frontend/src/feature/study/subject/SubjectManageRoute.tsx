import { useNavigate } from 'react-router'
import { SubjectManagePage } from './SubjectManagePage'

/** `/subjects`. 뒤로 가면 들어온 화면으로, 바로 열었으면 공부 탭으로. */
export function SubjectManageRoute() {
  const navigate = useNavigate()
  const onBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/', { replace: true })
  }
  return <SubjectManagePage onBack={onBack} />
}
