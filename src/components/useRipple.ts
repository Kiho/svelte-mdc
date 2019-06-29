import { afterUpdate, onDestroy } from 'svelte';
import { MDCRipple } from '@material/ripple';

export function mdcAfterUpdate(target: HTMLElement, mdcRipple: any, ripple: boolean, prevRipple: boolean, cb: (x: boolean) => void) {
	afterUpdate(() => {
		if (ripple != prevRipple) {
			if (ripple && !mdcRipple) {
				mdcRipple = new MDCRipple(target);
			} else if (!ripple && mdcRipple) {
				mdcRipple.destroy();
				mdcRipple = null;
			}
			cb(ripple);
		}
	});
}

export function mdcOnDestroy(mdcRipple: MDCRipple, mdcComponent?: any) {
	onDestroy(() => {
		if (mdcRipple !== null) {
			mdcRipple.destroy();
		}
		if (mdcComponent) {
			mdcComponent.destroy();
		}
	});
}

