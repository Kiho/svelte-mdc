import { afterUpdate, onMount, onDestroy } from 'svelte';
import { MDCRipple } from '@material/ripple';

export function mdcAfterUpdate(target: HTMLElement, mdcComponent: any, ripple: boolean, prevRipple: boolean, cb: (x: boolean) => void) {
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

export function mdcOnDestroy(mdcComponent: any) {
	onDestroy(() => {
		if (mdcComponent !== null) {
			mdcComponent.destroy();
		}
	});
}

