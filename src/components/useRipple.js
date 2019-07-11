import { afterUpdate, onMount, onDestroy } from 'svelte';
import { MDCRipple } from '@material/ripple';

export function mdcAfterUpdate(target, mdcComponent, ripple, prevRipple, cb) {
	afterUpdate(() => {
		if (ripple != prevRipple) {
			if (ripple && !mdcComponent) {
				mdcComponent = new MDCRipple(target);
			} else if (!ripple && mdcComponent) {
				mdcComponent.destroy();
				mdcComponent = null;
			}
			cb(ripple);
		}
	});
}

export function mdcOnDestroy(mdcComponent) {
	onDestroy(() => {
		if (mdcComponent !== null) {
			mdcComponent.destroy();
		}
	});
}

