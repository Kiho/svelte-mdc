<script>
  export let dark = '';
  export let customStyles = '';

  export let classes;
  $: classes = 'mdc-theme--dark';
</script>

<div class="{classes}" style="{customStyles}">
    <slot />
</div>   

