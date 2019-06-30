import { afterUpdate, onDestroy } from 'svelte';
import { MDCRipple } from '@material/ripple';

export interface IMDCRippleArg { 
	mdcComponent: any;
	mdcRipple: MDCRipple | undefined; 
	ripple: boolean;
	prevRipple: boolean;
}

export function mdcAfterUpdate(target: HTMLElement, mdc: IMDCRippleArg, unbounded?: boolean) {
	afterUpdate(() => {
		let { mdcRipple, ripple, prevRipple } = mdc;
		if (ripple != prevRipple) {
			if (ripple && !mdcRipple) {
				mdc.mdcRipple = new MDCRipple(target);
			  if (unbounded) mdc.mdcRipple.unbounded = true; 
			} else if (!ripple && mdcRipple) {
				mdcRipple.destroy();
				mdc.mdcRipple = undefined;
			}
			mdc.prevRipple = ripple;
		}
	});
}

export function mdcOnDestroy(mdc: IMDCRippleArg) {
	onDestroy(() => {
		let { mdcComponent, mdcRipple } = mdc;
		if (mdcRipple) {
			mdcRipple.destroy();
		}
		if (mdcComponent) {
			mdcComponent.destroy();
		}
	});
}

