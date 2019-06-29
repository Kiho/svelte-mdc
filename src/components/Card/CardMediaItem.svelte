<script>
  export let height = 1;
  export let altText = '';

  export let classes;
  $: classes = 'mdc-card__media-item--' + height + 'x';
</script>

<img class="mdc-card__media-item {classes}" alt="altText" />

<style type='text/scss'>
@import "@material/card/mdc-card";
</style>
