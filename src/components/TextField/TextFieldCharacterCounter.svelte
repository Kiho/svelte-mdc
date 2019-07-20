<script>
  import { beforeUpdate, onDestroy, onMount } from "svelte";
  import { MDCTextFieldCharacterCounter } from '@material/textfield/character-counter';
  import { addClassToSlot } from '../helpers';

  export let currentLength = 0;
  export let maxLength;

  let self;
  let input;
  let mdcComponent;
  let attrs, classes;
  let cl = 0, ml = 99999;
  let inputHandler;

  const onInput = () => {
    currentLength = input.value.length;
  };

  onMount(() => {
    input = self.parentElement.previousElementSibling.querySelector('.mdc-text-field__input');
    if (input) {
      maxLength = input.getAttribute('maxlength') || 99999;
      ml = maxLength;
      cl = currentLength = input.value.length;
      inputHandler = input.addEventListener('input', onInput);
    }
    mdcComponent = MDCTextFieldCharacterCounter.attachTo(self);
    mdcComponent.foundation.setCounterValue(cl, ml);
  });

  onDestroy(() => {
    if (mdcComponent) mdcComponent.destroy();
    if (inputHandler) {
      input.removeEventListener(inputHandler)
    }
  });

  $: {
    cl = currentLength;
    mdcComponent && mdcComponent.foundation.setCounterValue(cl, maxLength);
  }
  $: {
    ml = maxLength;
    mdcComponent && mdcComponent.foundation.setCounterValue(cl, ml);
  }

</script>

<div class="mdc-text-field-character-counter" bind:this={self}>
  {cl} / {ml}
</div>