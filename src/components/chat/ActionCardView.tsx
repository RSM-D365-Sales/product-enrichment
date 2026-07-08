import { ActionCard, CARD_KIND_LABEL } from '../../models/chat'

export function ActionCardView({
  card,
  onConfirm,
  onDismiss,
}: {
  card: ActionCard
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <div className={`action-card ${card.status}`}>
      <div className="ac-kind">{CARD_KIND_LABEL[card.kind]}</div>
      <div className="ac-title">{card.title}</div>
      <div className="ac-detail">{card.detail}</div>
      {card.status === 'proposed' ? (
        <div className="ac-actions">
          <button className="btn camel small" onClick={onConfirm}>
            Confirm &amp; apply
          </button>
          <button className="btn small" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      ) : (
        <div className={`ac-state ${card.status}`}>
          {card.status === 'applied' ? '✓ Applied and revalidated' : 'Dismissed'}
        </div>
      )}
    </div>
  )
}
