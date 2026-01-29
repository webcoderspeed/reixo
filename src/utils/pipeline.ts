export type TransformFn<In, Out> = (input: In) => Out;

export class Pipeline<In, Out> {
  private readonly fn: TransformFn<In, Out>;

  private constructor(fn: TransformFn<In, Out>) {
    this.fn = fn;
  }

  public static from<T>(): Pipeline<T, T> {
    return new Pipeline((x: T) => x);
  }

  public map<NewOut>(fn: TransformFn<Out, NewOut>): Pipeline<In, NewOut> {
    return new Pipeline((input: In) => fn(this.fn(input)));
  }

  public tap(fn: (input: Out) => void): Pipeline<In, Out> {
    return this.map((input) => {
      fn(input);
      return input;
    });
  }

  public execute(input: In): Out {
    return this.fn(input);
  }
}

export class AsyncPipeline<In, Out> {
  private readonly fn: (input: In) => Promise<Out>;

  private constructor(fn: (input: In) => Promise<Out>) {
    this.fn = fn;
  }

  public static from<T>(): AsyncPipeline<T, T> {
    return new AsyncPipeline(async (x: T) => x);
  }

  public map<NewOut>(fn: (input: Out) => NewOut | Promise<NewOut>): AsyncPipeline<In, NewOut> {
    return new AsyncPipeline(async (input: In) => {
      const prevResult = await this.fn(input);
      return fn(prevResult);
    });
  }

  public tap(fn: (input: Out) => void | Promise<void>): AsyncPipeline<In, Out> {
    return this.map(async (input) => {
      await fn(input);
      return input;
    });
  }

  public async execute(input: In): Promise<Out> {
    return this.fn(input);
  }
}
