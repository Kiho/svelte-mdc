<script>
  import { Drawer, DrawerHeader, DrawerContent, DrawerAppContent } from '../components/Drawer';
  import { TopAppBar, TopAppBarFixedAdjust } from '../components/TopAppBar';
  import { List, LinkListItem } from '../components/List';

  export let name = "";
  export let drawer = null;
  export let topAppBar = null;
  export let dismissible = false;
  export let modal = false;

  let attrs = null;
  if (window.location.search.indexOf('modal') > -1) {
    modal = true;
    attrs = { modal }
  }
  if (window.location.search.indexOf('dismissible') > -1) {
    dismissible = true;
    attrs = { dismissible }
  }

  function onNav(e) {
    console.log('e', e);
    if (dismissible) {
      drawer.toggle();
    } else if (modal) {
      drawer.toggle(true);
    }
  } 
  
</script>
<Drawer bind:this="{drawer}" {...attrs}>
  <DrawerHeader title="Mail" subtitle="email@material.io"/>
  <DrawerContent>
    <List ripple>
      <LinkListItem primaryText="Inbox" showGraphic activated>
        <i class="material-icons" slot="graphic">inbox</i>
      </LinkListItem>
      <LinkListItem primaryText="Outgoing" showGraphic >
        <i class="material-icons" slot="graphic">send</i>
      </LinkListItem>
      <LinkListItem primaryText="Drafts" showGraphic >
        <i class="material-icons" slot="graphic">drafts</i>
      </LinkListItem>
    </List>
  </DrawerContent>
</Drawer>
<DrawerAppContent>
  {#if dismissible || modal}
  <TopAppBar bind:this="{topAppBar}" on:nav="{onNav}" title="{modal ? 'Modal' : 'Dismissible'} Drawer" >
    <a href="#!" slot="navigation" class="material-icons">menu</a>
  </TopAppBar>
  {:else}
  <TopAppBar bind:this="{topAppBar}" title="Permanent Drawer" ></TopAppBar>
  {/if}
  <div class="drawer-main-content">
    <TopAppBarFixedAdjust />
    <p >Lorem ipsum dolor sit amet, consectetur adipiscing elit,
      sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
      enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
      aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in
      voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint
      occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit
      anim id est laborum.</p> <p >Lorem ipsum dolor sit amet, consectetur adipiscing elit,
      sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
      enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
      aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in
      voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint
      occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit
      anim id est laborum.</p> <p >Lorem ipsum dolor sit amet, consectetur adipiscing elit,
      sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
      enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
      aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in
      voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint
      occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit
      anim id est laborum.</p> <p >Lorem ipsum dolor sit amet, consectetur adipiscing elit,
      sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut
      enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
      aliquip ex ea commodo consequat.</p>
</DrawerAppContent>
