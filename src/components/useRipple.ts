import { afterUpdate, onDestroy } from 'svelte';
import { MDCRipple } from '@material/ripple';

export function mdcAfterUpdate(target: HTMLElement, mdc: any, unbounded?: boolean, cb?: (mdc: any) => void) {
	afterUpdate(() => {		
		if (mdc.ripple != mdc.prevRipple) {
			if (mdc.ripple && !mdc.mdcRipple) {
				mdc.mdcRipple = new MDCRipple(target);
			  if (unbounded) mdc.mdcRipple.unbounded = true; 
			} else if (!mdc.ripple && mdc.mdcRipple) {
				mdc.mdcRipple.destroy();
				mdc.mdcRipple = null;
			}
			cb && cb(mdc);
			mdc.prevRipple = mdc.ripple;
		}
	});
}

export function mdcOnDestroy(mdc: any) {
	onDestroy(() => {
		if (mdc.mdcRipple !== null) {
			mdc.mdcRipple.destroy();
		}
		if (mdc.mdcComponent) {
			mdc.mdcComponent.destroy();
		}
	});
}

