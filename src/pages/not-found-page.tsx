import { NavLink } from 'react-router-dom'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-i18n'

export function NotFoundPage() {
  const { t } = useT()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-10 text-center sm:px-6">
      <span className="flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <FileQuestion size={20} />
      </span>
      <p className="mt-5 text-[26px] font-bold leading-tight tracking-tight">404</p>
      <h1 className="mt-1 text-sm font-medium">{t('notfound.title')}</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{t('notfound.desc')}</p>
      <Button asChild className="mt-6">
        <NavLink to="/vsc-postman">
          <ArrowLeft />
          {t('notfound.back')}
        </NavLink>
      </Button>
    </div>
  )
}
