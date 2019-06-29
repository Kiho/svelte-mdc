import { afterUpdate, onDestroy } from 'svelte';
import { MDCRipple } from '@material/ripple';

export interface IMDCRipple { 
	mdcComponent: any;
	mdcRipple: MDCRipple | null; 
	ripple: boolean;
	prevRipple: boolean;
}

export function mdcAfterUpdate(target: HTMLElement, mdc: IMDCRipple, unbounded?: boolean, cb?: (mdc: IMDCRipple) => void) {
	afterUpdate(() => {
		let { mdcRipple, ripple, prevRipple } = mdc;
		if (ripple != prevRipple) {
			if (ripple && !mdcRipple) {
				mdc.mdcRipple = new MDCRipple(target);
			  if (unbounded) mdc.mdcRipple.unbounded = true; 
			} else if (!ripple && mdcRipple) {
				mdcRipple.destroy();
				mdc.mdcRipple = null;
			}
			cb && cb(mdc);
			mdc.prevRipple = ripple;
		}
	});
}

export function mdcOnDestroy(mdc: IMDCRipple) {
	onDestroy(() => {
		let { mdcComponent, mdcRipple } = mdc;
		if (mdcRipple !== null) {
			mdcRipple.destroy();
		}
		if (mdcComponent) {
			mdcComponent.destroy();
		}
	});
}

