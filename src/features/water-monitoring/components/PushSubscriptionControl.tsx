/**
 * PushSubscriptionControl.tsx
 *
 * Кнопка включения push. Разрешение запрашивается только по нажатию.
 */

import type { PushSubscriptionControls } from '../hooks/usePushSubscription';
import './PushSubscriptionControl.css';

interface PushSubscriptionControlProps {
    push: PushSubscriptionControls;
}

export default function PushSubscriptionControl({ push }: PushSubscriptionControlProps) {
    if (push.state === 'unsupported') {
        return <p className="push-control">Этот браузер не принимает push-уведомления.</p>;
    }
    if (push.state === 'denied') {
        return (
            <p className="push-control" role="status">
                Уведомления запрещены в браузере. Разрешите их в настройках сайта, затем вернитесь сюда.
            </p>
        );
    }
    if (push.state === 'subscribed') {
        return (
            <div className="push-control">
                <p>Уведомления этого браузера включены.</p>
                <button type="button" onClick={() => { void push.disable(); }}>Отключить</button>
            </div>
        );
    }
    return (
        <div className="push-control">
            <p>Уведомления о счетах приходят на это устройство, пока вы не выйдете из аккаунта.</p>
            {push.error && <p className="push-control__error" role="alert">{push.error}</p>}
            <button type="button" onClick={() => { void push.enable(); }}>Включить уведомления</button>
        </div>
    );
}
