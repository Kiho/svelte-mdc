<script>
  import { buildClasses } from '../helpers';

  export let dense = false;
  export let short = false;
  export let prominent = false;
  export let denseProminent = false;

  $: classes = buildClasses({
      'mdc-top-app-bar--dense-fixed-adjust': dense && !short,
      'mdc-top-app-bar--short-fixed-adjust': short,
      'mdc-top-app-bar--prominent-fixed-adjust': prominent && !short,
      'mdc-top-app-bar--dense-prominent-fixed-adjust': denseProminent && !short
    }, ['mdc-top-app-bar--fixed-adjust']);
</script>

<div class="{classes}"></div>