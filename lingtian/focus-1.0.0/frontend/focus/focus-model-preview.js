/* 衣橱二维试穿：与当前头像、入座人物共用合成原画，预览不修改已穿戴记录。 */
(function (global) {
  'use strict';
  const SLOTS=['head','robe','bottom','accessory'];

  function create() {
    if(!global.document||!global.FocusCharacters?.previewMarkup)return null;
    let container=null,content=null,ownedContent=false,current=null,lastKey='',active=false,destroyed=false;

    function signature(value) {
      return JSON.stringify([value.characterId,SLOTS.map(slot=>{
        const raw=value.equipped?.[slot];
        const entry=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:value.catalog?.getItem?.(raw)||value.catalog?.ITEM_MAP?.[raw]||{};
        return [slot,entry.id,entry.shape,entry.color,entry.accent,entry.name];
      })]);
    }
    function paint() {
      if(destroyed||!active||!current||!content||!container?.isConnected)return;
      const key=signature(current);
      // 相同快照或计时更新不会重复生成插画节点；纯 CSS 尺寸适配也不需要重新绘制。
      if(key!==lastKey){
        content.innerHTML=global.FocusCharacters.previewMarkup({avatarId:current.characterId},current.equipped,current.catalog);
        lastKey=key;
      }
      container.dataset.previewMode='2d';
      delete container.dataset.modelReady;
    }
    function mount(next) {
      if(destroyed||!next||next===container)return;
      if(container)delete container.dataset.previewMode;
      if(ownedContent)content?.remove();
      container=next;
      content=container.querySelector('.fx-model-fallback');
      ownedContent=!content;
      if(!content){content=global.document.createElement('div');content.className='fx-model-fallback';container.appendChild(content);}
      lastKey='';
      container.dataset.previewMode='2d';
      delete container.dataset.modelReady;
    }
    function update(value) {
      if(destroyed||!value)return;
      current=value;paint();
    }
    function setActive(value) {
      if(destroyed)return;
      active=!!value;if(active)paint();
    }
    function resize() { /* 文档流与 CSS 自适应，无需测量画布或重建插画。 */ }
    function destroy() {
      if(destroyed)return;
      destroyed=true;active=false;current=null;
      unsubscribeReady?.();
      if(container)delete container.dataset.previewMode;
      if(ownedContent)content?.remove();
      container=content=null;
    }
    const unsubscribeReady=global.FocusCharacters.onReady?.(()=>{
      if(destroyed)return;
      lastKey='';paint();
    });
    return {mount,update,setActive,resize,destroy,renderingMode:'2d'};
  }
  // 延续已有加载完成事件，避免衣橱懒加载接入发生变化。
  global.FocusModelPreview=Object.freeze({create});
  if(global.dispatchEvent&&global.Event)global.dispatchEvent(new global.Event('focus-model-preview-ready'));
})(typeof window!=='undefined'?window:globalThis);
