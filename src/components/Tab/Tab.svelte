<script>
  export let tab = null;

  export let icon = '';
  export let active = false;
  export let iconOnly = false;
  export let href='';
  export let ripple = false;
  export let focusOnActivate = false;
  export let spanningOnlyContent = false;
  export let stacked = false;
  export let minWidth = false;
</script>

<a
  bind:this="{tab}"
  class="mdc-tab"
  class:mdc-tab--active={active}
  class:mdc-tab--stacked={stacked}
  class:mdc-tab--minWidth={minWidth}
  role="tab" 
  aria-selected="{active}"
  href="{href}"
>
  <span class="mdc-tab__content">
    {#if icon}
    <span class="mdc-tab__icon material-icons" aria-hidden="true">{icon}</span>
    {#if !iconOnly}
    <span class="mdc-tab__text-label"><slot></slot></span>
    {/if} {:else}
    <slot></slot>
    {/if}
    {#if spanningOnlyContent}
    <span class="mdc-tab-indicator">
      <span class="mdc-tab-indicator__content mdc-tab-indicator__content--underline"></span>
    </span>
    {/if}
  </span>
  {#if !spanningOnlyContent}
  <span class="mdc-tab-indicator" class:mdc-tab-indicator--active={active}>
    <span class="mdc-tab-indicator__content mdc-tab-indicator__content--underline"></span>
  </span>
  {/if}
  <span class="mdc-tab__ripple"></span>
</a>
