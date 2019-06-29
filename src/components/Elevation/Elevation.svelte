<script>
  export let level = 1;
  export let transition = false;

  export let classes;
  $: {
    let calc = 'mdc-elevation--z' + level
    transition && (calc += ' mdc-elevation-transition')
    classes = calc
  }
</script>

<div class="{classes}">
  <slot />
</div>

