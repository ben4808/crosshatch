// https://itnext.io/priority-queue-in-typescript-6ef23116901

  interface Node<T> {
    key: number
    value: T
  }

  export interface PriorityQueue<T> {
      isEmpty: () => boolean,
      peek: () => T | null,
      size: () => number,
      insert: (item: T, prio: number) => void,
      pop: () => T | null,
  }
  
  export const priorityQueue = <T>(): PriorityQueue<T> => {
    let heap: Node<T>[] = []

    const parent = (index: number) => Math.floor((index - 1) / 2)
    const left = (index: number) => 2 * index + 1
    const right = (index: number) =>  2 * index + 2
    const hasLeft = (index: number) => left(index) < heap.length
    const hasRight = (index: number) => right(index) < heap.length

    const swap = (a: number, b: number) => {
        let temp = heap[a];
        heap[a] = heap[b];
        heap[b] = temp;
    }
  
    return {
      
      isEmpty: () => heap.length == 0,
  
      peek: () => heap.length == 0 ? null : heap[0].value,
      
      size: () => heap.length,

      insert: (item, prio) => {
        heap.push({key: prio, value: item})
  
        let i = heap.length -1
        while(i > 0) {
          const p = parent(i)
          if(heap[p].key > heap[i].key) break
          const tmp = heap[i]
          heap[i] = heap[p]
          heap[p] = tmp
          i = p
        }
      },

      pop: () => {
        if(heap.length == 0) return null
        
        swap(0, heap.length - 1)
        const item = heap.pop()
  
        let current = 0
        while(hasLeft(current)) {
          let largerChild = left(current)
          if(hasRight(current) && heap[right(current)].key > heap[left(current)].key) 
            largerChild = right(current)
  
          if(heap[largerChild].key < heap[current].key) break
  
          swap(current, largerChild)
          current = largerChild
        }
  
        return item!.value
      }
    }
  }