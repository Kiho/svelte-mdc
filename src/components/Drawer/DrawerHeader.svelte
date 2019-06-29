<script>
  export let title = '';
  export let subtitle = '';
</script>

<div class="mdc-drawer__header">
  {#if title}
  <h3 class="mdc-drawer__title">{title}</h3>
  {/if}
  {#if subtitle}
  <h6 class="mdc-drawer__subtitle">{subtitle}</h6>
  {/if}
  <slot />
</div>
