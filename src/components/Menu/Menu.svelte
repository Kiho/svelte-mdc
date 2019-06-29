<script context="module">
  import { Corner as corner } from "@material/menu";
  let Corner = corner;
</script>

<script>
  import {
    beforeUpdate,
    createEventDispatcher,
    onDestroy,
    onMount
  } from "svelte";
  import { MDCMenu } from "@material/menu";
  import { List } from "../List";

  const dispatch = createEventDispatcher();

  export let menu = null;
  export let open = false;
  export let quickOpen = false;
  export let selected = null;
  export let anchorCorner = null;
  export let anchorMargin = null;

  let mdcComponent;

  onMount(() => {
    mdcComponent = new MDCMenu(menu);
    mdcComponent.listen("MDCMenu:selected", obj => {
      dispatch("selected", obj);
      selected = obj.detail.index;
      open = false;
      console.log('MDCMenu:selected', obj.detail);
    });
  });

  onDestroy(() => {
    mdcComponent && mdcComponent.destroy();
  });

  $: if (mdcComponent) {
    mdcComponent.open = open;
    console.log('mdcComponent.open', open);
  }
  $: if (mdcComponent) {
    mdcComponent.quickOpen = quickOpen;
  }

  $: if (mdcComponent) {
    if (anchorCorner) {
      mdcComponent.setAnchorCorner(Corner[anchorCorner.toUpperCase()]);
    } else {
      mdcComponent.setAnchorCorner(Corner.TOP_START);
    }
  }

  $: if (mdcComponent && anchorMargin) {
    mdcComponent.setAnchorMargin(anchorMargin);
  }

  export function showItem(number) {
    mdcComponent.show(number);
  }

  export function show(isOpen) {
    if (mdcComponent.open !== open) {
      mdcComponent.open = open;
    }    
    open = isOpen;
  }
</script>

<div bind:this="{menu}" tabindex="-1" class="mdc-menu mdc-menu-surface">
  <List as="ul" role="menu" aria-hidden="true">
    <slot></slot>
  </List>
</div>
