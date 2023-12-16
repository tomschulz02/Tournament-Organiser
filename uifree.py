import random

random.seed()

def createGroups(teams_list, no_of_groups):
    groups_list = []

    for i in range(no_of_groups):
        groups_list.append([])
    
    index = 0
    #the forward flag determines which way we traverse the groups list
    #True = traverse from left to right; False = traverse from right to left
    forward_flag = False
    for team in teams_list:
        mod_index = index%no_of_groups
        if (mod_index==0):
            forward_flag = not forward_flag

        if (forward_flag):
            groups_list[mod_index].append(team)
        else:
            groups_list[no_of_groups-1-mod_index].append(team)
        index+=1

    return groups_list

def determineSeeding(ranked, unranked):
    full_seeded = []
    for team in ranked:
        full_seeded.append(team)
    
    remaining = len(unranked)
    while (remaining>1):
        full_seeded.append(unranked.pop(random.randint(0,remaining-1)))
        remaining -= 1
    full_seeded.append(unranked[0])

    return full_seeded

def generateFixtures(groups):
    pass