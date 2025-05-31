from functools import partial
import random
import sys
import json

def total_weighted_tardiness(seq,P,D,C):
    t, total = 0, 0
    for j in seq:
        t += P[j]
        total += C[j]*max(0, t-D[j])
    return total

def crossover(p1, p2):
    N = len(p1)
    a,b = sorted(random.sample(range(N),2))
    child = [-1]*N
    child[a:b] = p1[a:b]
    pos = b
    for g in p2[b:]+p2[:b]:
        if g not in child:
            child[pos%N] = g
            pos+=1
    return child

def mutate(seq, rate):
    N = len(seq)
    if random.random()<rate:
        i,j = sorted(random.sample(range(N),2))
        seq[i],seq[j] = seq[j],seq[i]


def GA(P,D,C,pop_size=50, generations=500, cxr=0.8, mutr=0.2):
    '''
    P 是完成各個作業預計花費的時間且長度為N的陣列  
    D 是各個作業的截止時間且長度為N的陣列  
    C 是各個作業未及時完成(接受遲交的時間內)處罰的參數且長度為N的陣列  
    pop_size 為生成陣列的長度  
    generations 為運算次數  
    cxr 為交叉機率  
    mutr 為變異機率  

    此函式會回傳作業完成的順序  
    '''
    if not (len(P) == len(D) == len(C)):
        raise ValueError("參數 P, D, C 的長度必須相同")
    elif len(P) == 0:
        raise ValueError("參數 P, D, C的長度必須大於零")
    
    N = len(P)
    pop = [random.sample(range(N), N) for _ in range(pop_size)]
    for gen in range(generations):
        pop = sorted(pop, key=partial(total_weighted_tardiness,P=P,D=D,C=C))
        newpop = pop[:int(0.1*pop_size)] 
        while len(newpop)<pop_size:
            if random.random()<cxr:
                p1,p2 = random.sample(pop[:20],2)
                c = crossover(p1,p2)
            else:
                c = random.choice(pop)
            mutate(c, mutr)
            newpop.append(c)
        pop = newpop
    best = min(pop, key=partial(total_weighted_tardiness,P=P,D=D,C=C))
    return best

def RANDOM(P,D,C,pop_size=50, generations=100, cxr=0.8, mutr=0.2):
    if not (len(P) == len(D) == len(C)):
        raise ValueError("參數 P, D, C的長度必須相同")
    elif len(P) == 0:
        raise ValueError("參數 P, D, C的長度必須大於零")
    
    l = GA(P,D,C)
    n = len(l)
    selected = []
    remaining = l.copy()

    # 依照 index 反比當作 weight，index 越小 weight 越大
    def get_weights(items):
        length = len(items)
        return [length - i for i in range(length)]

    while remaining:
        weights = get_weights(remaining)
        total_weight = sum(weights)
        r = random.uniform(0, total_weight)
        acc = 0
        for i, weight in enumerate(weights):
            acc += weight
            if r <= acc:
                selected.append(remaining.pop(i))
                break

    return selected   

def schedule(Name,P,D,C,method=1):
    seq = []
    P2 = list(map(int, P))
    D2 = list(map(int, D))
    C2 = list(map(int, C))
    if(method == 2):
        seq = RANDOM(P=P2, D=D2, C=C2)
    elif(method == 3):
        seq = sorted(range(len(D)), key=lambda k: D[k])
    elif(method == 4):
        seq = sorted(range(len(C)), key=lambda k: C[k],reverse=True)
    elif(method == 5):
        seq = sorted(range(len(P)), key=lambda k: P[k])
    else:
        seq = GA(P=P2, D=D2, C=C2)
    outputID = []
    for i in seq:
        outputID.append(Name[i])
    return outputID


if __name__ == "__main__":
    input_data = sys.stdin.read()
    data = json.loads(input_data)
    
    expectedTime = data['expectedTime']
    penalty = data['penalty']
    endTimes = data['endTimes']
    taskNames = data['taskIDs']
    alg = int(data['alg'])
    result = schedule(Name=taskNames,P=expectedTime, D=endTimes, C=penalty,method=alg)
    print(json.dumps(result))
