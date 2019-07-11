<script>
  import { Drawer } from '../components/Drawer';
  import { TopAppBar } from '../components/TopAppBar'; 
  import { List, LinkListItem } from '../components/List';

  export let drawerOpen = false;

  function onNav(e) {
    console.log('e', e);
    drawerOpen = !drawerOpen;
  } 
  
</script>
<Drawer dismissible open="{drawerOpen}" >
  <div slot="header">
    <h3 class="mdc-drawer__title">Mail</h3>
    <h6 class="mdc-drawer__subtitle">email@material.io</h6>
  </div>
  <div>
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
  </div>
</Drawer>
<div class="mdc-drawer-app-content">
  <TopAppBar on:nav="{onNav}">
    <div class="mdc-top-app-bar__row">
      <section class="mdc-top-app-bar__section mdc-top-app-bar__section--align-start">
        <a href="#!" class="demo-menu material-icons mdc-top-app-bar__navigation-icon">menu</a>
        <span class="mdc-top-app-bar__title">Dismissible Drawer</span>
      </section>
    </div>
  </TopAppBar>
  <div class="drawer-main-content"><div class="mdc-top-app-bar--fixed-adjust"></div> 
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
      aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in
      voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint
      occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit
      anim id est laborum.</p></div>
</div>
