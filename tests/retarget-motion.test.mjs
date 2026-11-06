import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indicatorFrame, nextTabKey, retarget } from '../src/retarget-motion.mjs';

function fakeNode(computed = {}) {
  const animations = [];
  return {
    animations,
    style: {},
    ownerDocument: { defaultView: { getComputedStyle: () => computed } },
    getAnimations() { return animations.slice(); },
    animate(frames) {
      const animation = {
        frames,
        cancel() {
          const index = animations.indexOf(animation);
          if (index >= 0) animations.splice(index, 1);
        },
      };
      animations.push(animation);
      return animation;
    },
  };
}

test('the chart indicator frame follows the selected tab, including a wrapped row', () => {
  const list = { offsetLeft: 8, offsetTop: 4 };
  const tab = { offsetLeft: 48, offsetTop: 40, offsetHeight: 36, offsetWidth: 72 };
  const frame = indicatorFrame(tab, list);
  assert.equal(frame.transform, 'translate3d(40px, 70px, 0)');
  assert.equal(frame.width, '72px');
});

test('arrow keys select the next chart tab immediately, including wrap', () => {
  const keys = ['timeline', 'trend'];
  assert.equal(nextTabKey(keys, 'timeline', 'ArrowRight'), 'trend');
  assert.equal(nextTabKey(keys, 'trend', 'ArrowRight'), 'timeline');
  assert.equal(nextTabKey(keys, 'trend', 'ArrowLeft'), 'timeline');
  assert.equal(nextTabKey(keys, 'timeline', 'Home'), 'timeline');
  assert.equal(nextTabKey(keys, 'timeline', 'End'), 'trend');
  assert.equal(nextTabKey(keys, 'timeline', 'Enter'), null);
});

test('motion keeps the latest end state and skips the first paint and reduced motion', () => {
  const node = fakeNode({ opacity: '0.8' });
  assert.equal(retarget(node, [{ opacity: '0.72' }, { opacity: '1' }], { first: true }), 'still');
  assert.equal(node.style.opacity, '1');
  assert.equal(node.animations.length, 0);

  assert.equal(retarget(node, [{ opacity: '0.72' }, { opacity: '1' }]), 'played');
  assert.equal(node.animations.length, 1);
  assert.equal(node.animations[0].frames[0].opacity, '0.72');

  assert.equal(retarget(node, [{ opacity: '0.2' }, { opacity: '1' }]), 'played');
  assert.equal(node.animations.length, 1);
  assert.equal(node.animations[0].frames[0].opacity, '0.8');
  assert.equal(node.animations[0].frames[1].opacity, '1');

  assert.equal(retarget(node, [{ opacity: '1' }], { reduce: true }), 'still');
  assert.equal(node.animations.length, 0);
  assert.equal(node.style.opacity, '1');
});
