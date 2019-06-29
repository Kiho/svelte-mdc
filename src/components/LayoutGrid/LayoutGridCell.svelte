<script>
  export let span = '';
  export let spanDesktop = '';
  export let spanTablet = '';
  export let spanPhone = '';
  export let align = '';
  export let order = '';

  export let classes;
  $: {
    const classList = []

    span && classList.push('mdc-layout-grid__cell--span-' + span)
    spanDesktop && classList.push('mdc-layout-grid__cell--span-' + spanDesktop + '-desktop')
    spanTablet && classList.push('mdc-layout-grid__cell--span-' + spanTablet + '-tablet')
    spanPhone && classList.push('mdc-layout-grid__cell--span-' + spanPhone + '-phone')
    align && classList.push('mdc-layout-grid__cell--align-' + align)
    order && classList.push('mdc-layout-grid__cell--order-' + order)

    classes = classList.join(' ')
  }
</script>

<div class="mdc-layout-grid__cell {classes}">
  <slot />
</div>
