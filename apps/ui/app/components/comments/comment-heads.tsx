import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@taucad/ui/components/button';
import { Popover, PopoverAnchor, PopoverContent } from '@taucad/ui/components/popover';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import type { CommentSurfacePick, useCommentPins } from '@taucad/viewer/cad/comment-pins';
import { CommentCard, ReadOnlyCommentCard } from '#components/comments/comment-card.js';
import { CommentSheet } from '#components/comments/comment-sheet.js';
import type { ViewerCommentsValue } from '#components/comments/viewer-comments.js';

/*
 * The numbered heads of a viewer's pins and the card its open comment is written in, inside the viewer's stage. Kept
 * apart from `ViewerComments` so a viewer without comments never loads them.
 */

const pinId = String;

const headClass =
  'pointer-events-auto absolute top-0 left-0 flex size-6 items-center justify-center rounded-full border-2 border-white bg-markup-ink text-xs font-semibold text-white shadow-sm outline-none pointer-coarse:before:absolute pointer-coarse:before:-inset-2.5 focus-visible:focus-outline data-[occluded=true]:opacity-40 data-[sent=true]:border-markup-ink data-[sent=true]:bg-background data-[sent=true]:text-markup-ink data-[outdated=true]:border-dashed data-[moving=true]:animate-pulse';

/** How far a press on a head travels, in CSS pixels, before it is a drag and not a click (charter D23). */
const dragSlop = 4;

type PinHeads = NonNullable<ReturnType<typeof useCommentPins>>['heads'];

type HeadDrag = { pointerId: number; x: number; y: number; isDragging: boolean };

/**
 * Drags a draft pin's head to move the pin: the head follows the pointer with the ghost pin under it, and a drop on the
 * model moves the pin there. A drop on nothing, a cancelled pointer or Escape puts it back. A press that does not
 * travel stays a click.
 */
function usePinHeadDrag(
  heads: PinHeads,
  onMove: ((number: number, pick: CommentSurfacePick) => void) | undefined,
): (number: number) => React.HTMLAttributes<HTMLElement> {
  // A ref, not state: pointer events can arrive faster than React renders.
  const drag = useRef<HeadDrag & { number: number }>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const end = useCallback((): void => {
    heads.surface.current?.hover(undefined);
    heads.hold(undefined);
    drag.current = undefined;
    setIsDragging(false);
  }, [heads]);
  useEffect(() => {
    if (!isDragging) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        end();
      }
    };
    globalThis.addEventListener('keydown', onKey, true);
    return () => {
      globalThis.removeEventListener('keydown', onKey, true);
    };
  }, [end, isDragging]);

  return (number) =>
    onMove === undefined
      ? {}
      : {
          onPointerDown(event) {
            if (event.button !== 0 || !event.isPrimary) {
              return;
            }
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              number,
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              isDragging: false,
            };
          },
          onPointerMove(event) {
            const held = drag.current;
            if (held?.number !== number || held.pointerId !== event.pointerId) {
              return;
            }
            if (!held.isDragging) {
              if (Math.hypot(event.clientX - held.x, event.clientY - held.y) <= dragSlop) {
                return;
              }
              held.isDragging = true;
              heads.hold(pinId(number));
              setIsDragging(true);
            }
            const element = event.currentTarget;
            const frame = (element.offsetParent ?? element.parentElement)?.getBoundingClientRect();
            if (frame) {
              element.style.transform = `translate3d(${event.clientX - frame.left}px, ${event.clientY - frame.top}px, 0) translate(-50%, -50%)`;
            }
            heads.surface.current?.hover({ x: event.clientX, y: event.clientY });
          },
          onPointerUp(event) {
            const held = drag.current;
            if (held?.number !== number || held.pointerId !== event.pointerId) {
              return;
            }
            if (!held.isDragging) {
              drag.current = undefined;
              return;
            }
            const pick = heads.surface.current?.pick({ x: event.clientX, y: event.clientY });
            end();
            // The release ends a drag, not a click: the card stays as it was.
            event.currentTarget.dataset['dragged'] = 'true';
            if (pick) {
              onMove(number, pick);
            }
          },
          onPointerCancel() {
            if (drag.current?.number === number) {
              end();
            }
          },
        };
}

/**
 * The numbered heads of the viewer's pins and the open comment's card, loaded when the viewer first has a comment.
 *
 * @param props - The viewer's comments and its pin heads.
 * @returns The heads.
 */
export function CommentHeads({
  value,
  heads,
}: {
  readonly value: ViewerCommentsValue;
  readonly heads: PinHeads;
}): React.JSX.Element {
  const {
    comments,
    openNumber,
    open,
    close,
    setText,
    remove,
    move,
    movingNumber,
    startMove,
    isReadOnly,
    hideShown,
    outdated,
  } = value;
  const dragProps = usePinHeadDrag(heads, isReadOnly ? undefined : move);
  const isPhone = useIsMobile();
  const cardOf = (comment: (typeof comments)[number]): React.JSX.Element =>
    isReadOnly ? (
      <ReadOnlyCommentCard comment={comment} isOutdated={outdated.has(comment.number)} />
    ) : (
      <CommentCard
        comment={comment}
        isOutdated={outdated.has(comment.number)}
        hasDoneButton={isPhone}
        onText={(text) => {
          setText(comment.number, text);
        }}
        onRemove={() => {
          remove(comment.number);
        }}
        onDone={close}
        onMove={() => {
          startMove(comment.number);
        }}
      />
    );
  const openComment = isPhone ? comments.find((comment) => comment.number === openNumber) : undefined;
  return (
    <div className='pointer-events-none absolute inset-0 z-10' data-comment-ui=''>
      {movingNumber === undefined ? null : (
        <div
          role='status'
          className='absolute top-2 left-1/2 -translate-x-1/2 rounded-full border border-border bg-background px-3 py-1 text-xs shadow-sm'
        >
          Click the model where comment {movingNumber} goes. Escape to cancel.
        </div>
      )}
      {hideShown ? (
        <div
          role='status'
          className='pointer-events-auto absolute top-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background py-1 pr-1 pl-3 text-xs shadow-sm'
        >
          Showing comments from an earlier message
          <Button variant='ghost' size='sm' onClick={hideShown}>
            Hide
          </Button>
        </div>
      ) : null}
      {comments.map((comment) => {
        const id = pinId(comment.number);
        const isOpen = comment.number === openNumber;
        const head = (
          <button
            ref={(element) => {
              heads.register(id, element ?? undefined);
            }}
            type='button'
            data-comment-ui=''
            aria-label={`Comment ${comment.number}${comment.text ? `: ${comment.text}` : ''}`}
            aria-expanded={isOpen}
            data-sent={isReadOnly}
            data-outdated={outdated.has(comment.number)}
            data-moving={movingNumber === comment.number}
            className={headClass}
            style={{ visibility: 'hidden' }}
            {...dragProps(comment.number)}
            onClick={(event) => {
              // A drag's release is not a click.
              if (event.currentTarget.dataset['dragged'] === 'true') {
                delete event.currentTarget.dataset['dragged'];
                return;
              }
              if (isOpen) {
                close();
              } else {
                open(comment.number);
              }
            }}
          >
            {comment.number}
          </button>
        );
        return (
          <Popover
            key={id}
            open={isOpen}
            onOpenChange={(next) => {
              if (!next && isOpen) {
                close();
              }
            }}
          >
            <PopoverAnchor asChild>{head}</PopoverAnchor>
            {isPhone ? null : (
              <PopoverContent side='right' align='start' className='w-72 p-3' updatePositionStrategy='always'>
                {cardOf(comment)}
              </PopoverContent>
            )}
          </Popover>
        );
      })}
      {openComment === undefined ? null : (
        <CommentSheet label={`Comment ${openComment.number}`} onClose={close}>
          {cardOf(openComment)}
        </CommentSheet>
      )}
    </div>
  );
}
