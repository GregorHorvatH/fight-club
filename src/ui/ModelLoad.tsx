import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { percentOf, useModelLoad } from '../state/modelLoad'

/** The fallback of a model that is still loading (draws nothing; it only tells the store that a model is on its way). */
export function Pending({ url }: { url: string }) {
  useEffect(() => {
    const { start, done } = useModelLoad.getState()
    start(url)
    return () => done(url)
  }, [url])
  return null
}

/** The note over the arena: "Loading fighters… 40%" while the models come, or the one that says they could not be loaded. */
export function ModelNotice() {
  const { t } = useTranslation()
  const waiting = useModelLoad((s) => s.waiting)
  const bytes = useModelLoad((s) => s.bytes)
  const failed = useModelLoad((s) => s.failed)
  const dismiss = useModelLoad((s) => s.dismiss)
  if (waiting.length > 0) {
    const percent = percentOf(waiting, bytes)
    return (
      <div className="model-notice" role="status">
        {percent === null ? t('common.loading3d') : t('common.loadingFighters', { percent })}
      </div>
    )
  }
  if (failed) {
    return (
      <button className="model-notice failed" onClick={dismiss}>
        {t('common.modelsFailed')}
      </button>
    )
  }
  return null
}
