<script>
  import { beforeUpdate, onDestroy, onMount } from "svelte";
  import { MDCTextFieldCharacterCounter } from '@material/textfield/character-counter';
  import { addClassToSlot } from '../helpers';

  export let currentLength = 0;
  export let maxLength;

  let self;
  let mdcComponent;
  let attrs, classes;
  let cl = 0, ml;

  onMount(() => {
    addClassToSlot(self, 'characterCounter', 'mdc-text-field-character-counter');
    let input = self.parentElement.parentElement.previousElementSibling.querySelector('.mdc-text-field__input')
    if (input) {
      ml = input.getAttribute('maxlength') || 9999;
      cl = input.value.length;
    }
    mdcComponent = MDCTextFieldCharacterCounter.attachTo(self);
    mdcComponent.foundation.setCounterValue(cl, ml);
  });

  onDestroy(() => {
    if (mdcComponent) mdcComponent.destroy();
  });

  $: {
    cl = currentLength;
    mdcComponent && mdcComponent.foundation.setCounterValue(currentLength, maxLength);
  }
  // $: {
  //   ml = maxLength;
  //   mdcComponent && mdcComponent.foundation.setCounterValue(currentLength, maxLength);
  // }

</script>

<span bind:this={self}>
  {currentLength} / {maxLength}
</span>